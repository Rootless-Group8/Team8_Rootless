const path = require('path');
const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const DOCUMENTS_COLLECTION = 'documents';

const DOCUMENT_TYPES = [
  'passport',
  'visa_form',
  'supporting_document',
  'identification',
  'financial_record',
  'other',
];

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Error carrying an HTTP status and a machine-readable code so the route
 * layer can translate service failures into consistent JSON responses.
 */
class DocumentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'DocumentError';
    this.status = status;
    this.code = code;
  }
}

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

function getBucket() {
  // Bucket name comes from backend/.env so firebaseAdmin.js needs no changes.
  return initializeFirebaseAdmin().storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
}

/**
 * Strips directory parts and unsafe characters from an uploaded file name
 * so it can be used safely inside a Storage object path.
 */
function sanitizeFileName(name) {
  const base = path.basename(String(name || ''));
  const cleaned = base.replace(/[^\w.-]+/g, '_').slice(0, 150);
  return cleaned || 'file';
}

/**
 * Validates an upload request. Returns an object mapping field name to
 * error message. An empty object means the input is valid.
 *
 * @param {object} file multer file object (originalname, mimetype, size, buffer)
 * @param {string} documentType
 */
function validateUploadInput(file, documentType) {
  const errors = {};

  if (!file || !file.buffer || file.size === 0) {
    errors.file = 'A non-empty file is required.';
  } else {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      errors.file = `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}.`;
    } else if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.file = 'File exceeds the 10 MB size limit.';
    }
  }

  if (!DOCUMENT_TYPES.includes(documentType)) {
    errors.documentType = `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}.`;
  }

  return errors;
}

/**
 * Shapes a Firestore document for API responses. The internal storage
 * path is intentionally not exposed to clients.
 */
function toPublicDocument(id, data) {
  return {
    id,
    fileName: data.fileName,
    documentType: data.documentType,
    contentType: data.contentType,
    size: data.size,
    uploadedAt: data.uploadedAt,
    ownerUid: data.ownerUid,
  };
}

/**
 * Loads a document and confirms the caller owns it.
 * Throws 404 if it does not exist and 403 if it belongs to someone else.
 */
async function loadOwnedDocument(uid, documentId) {
  const docRef = getDb().collection(DOCUMENTS_COLLECTION).doc(documentId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new DocumentError(404, 'document_not_found', 'Document not found.');
  }

  const data = snapshot.data();
  if (data.ownerUid !== uid) {
    throw new DocumentError(
      403,
      'forbidden',
      'You do not have access to this document.'
    );
  }

  return { docRef, data };
}

/**
 * Uploads a file to Firebase Storage and saves its metadata in Firestore.
 * If the Firestore write fails, the uploaded file is removed so Storage
 * and Firestore never drift out of sync.
 *
 * Caller is responsible for validating input first via validateUploadInput.
 *
 * @param {string} uid
 * @param {object} file multer file object
 * @param {string} documentType
 * @returns {Promise<object>} public document metadata
 */
async function uploadDocument(uid, file, documentType) {
  const docRef = getDb().collection(DOCUMENTS_COLLECTION).doc();
  const fileName = sanitizeFileName(file.originalname);
  const storagePath = `users/${uid}/documents/${docRef.id}_${fileName}`;
  const storageFile = getBucket().file(storagePath);

  await storageFile.save(file.buffer, {
    resumable: false,
    contentType: file.mimetype,
    metadata: { metadata: { ownerUid: uid, documentId: docRef.id } },
  });

  const data = {
    ownerUid: uid,
    fileName,
    documentType,
    contentType: file.mimetype,
    size: file.size,
    storagePath,
    uploadedAt: new Date().toISOString(),
  };

  try {
    await docRef.set(data);
  } catch (err) {
    try {
      await storageFile.delete({ ignoreNotFound: true });
    } catch (cleanupErr) {
      console.error('Failed to clean up orphaned file:', storagePath);
    }
    throw err;
  }

  return toPublicDocument(docRef.id, data);
}

/**
 * Lists all documents owned by the given user, newest first.
 * Sorting happens in memory to avoid needing a composite Firestore index.
 *
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
async function listDocuments(uid) {
  const snapshot = await getDb()
    .collection(DOCUMENTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();

  const documents = [];
  snapshot.forEach((doc) => {
    documents.push(toPublicDocument(doc.id, doc.data()));
  });

  documents.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return documents;
}

/**
 * Returns one document's metadata plus a short-lived signed URL to the file.
 * Throws DocumentError 404 or 403 as appropriate.
 *
 * @param {string} uid
 * @param {string} documentId
 * @returns {Promise<object>}
 */
async function getDocument(uid, documentId) {
  const { data } = await loadOwnedDocument(uid, documentId);

  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [downloadUrl] = await getBucket()
    .file(data.storagePath)
    .getSignedUrl({ action: 'read', expires: expiresAt });

  return {
    ...toPublicDocument(documentId, data),
    downloadUrl,
    downloadUrlExpiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Deletes the file from Storage and its metadata from Firestore.
 * The file is removed first so a failed Storage delete leaves the metadata
 * in place and the request can simply be retried.
 *
 * @param {string} uid
 * @param {string} documentId
 */
async function deleteDocument(uid, documentId) {
  const { docRef, data } = await loadOwnedDocument(uid, documentId);

  await getBucket().file(data.storagePath).delete({ ignoreNotFound: true });
  await docRef.delete();
}

module.exports = {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  validateUploadInput,
  DocumentError,
  DOCUMENT_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
};
