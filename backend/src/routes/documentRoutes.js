const express = require('express');
const multer = require('multer');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  validateUploadInput,
  DocumentError,
  MAX_FILE_SIZE_BYTES,
} = require('../services/documentService');

const router = express.Router();

// All document routes require a valid Firebase ID token.
router.use(verifyFirebaseToken);

// Files are held in memory and streamed to Firebase Storage by the service.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

/**
 * Runs multer and converts its errors into our standard JSON error format.
 */
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'file_too_large',
        message: 'File exceeds the 10 MB size limit.',
      });
    }
    return res.status(400).json({
      error: 'invalid_upload',
      message: 'Upload could not be processed. Send one file in the "file" field.',
    });
  });
}

function sendError(res, err) {
  if (err instanceof DocumentError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error('Document route error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong. Please try again.',
  });
}

/**
 * POST /api/documents
 * multipart/form-data with fields: file (required), documentType (required)
 */
router.post('/', handleUpload, async (req, res) => {
  const documentType = req.body && req.body.documentType;
  const errors = validateUploadInput(req.file, documentType);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Upload validation failed.',
      details: errors,
    });
  }

  try {
    const document = await uploadDocument(req.firebaseUser.uid, req.file, documentType);
    return res.status(201).json({ document });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/documents
 * Lists the authenticated user's documents.
 */
router.get('/', async (req, res) => {
  try {
    const documents = await listDocuments(req.firebaseUser.uid);
    return res.status(200).json({ documents, count: documents.length });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/documents/:id
 * Returns one document's metadata and a short-lived signed download URL.
 */
router.get('/:id', async (req, res) => {
  try {
    const document = await getDocument(req.firebaseUser.uid, req.params.id);
    return res.status(200).json({ document });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * DELETE /api/documents/:id
 * Removes the file from Storage and its metadata from Firestore.
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteDocument(req.firebaseUser.uid, req.params.id);
    return res.status(200).json({ message: 'Document deleted.', id: req.params.id });
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
