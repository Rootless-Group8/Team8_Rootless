const mockFileSave = jest.fn();
const mockFileDelete = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockBucketFile = jest.fn(() => ({
  save: mockFileSave,
  delete: mockFileDelete,
  getSignedUrl: mockGetSignedUrl,
}));

const mockDocSet = jest.fn();
const mockDocGet = jest.fn();
const mockDocDelete = jest.fn();
const mockDoc = jest.fn((id) => ({
  id: id || 'new-doc-id',
  set: mockDocSet,
  get: mockDocGet,
  delete: mockDocDelete,
}));

const mockQueryGet = jest.fn();
const mockWhere = jest.fn(() => ({ get: mockQueryGet }));

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({
    firestore: () => ({
      collection: () => ({ doc: mockDoc, where: mockWhere }),
    }),
    storage: () => ({
      bucket: () => ({ file: mockBucketFile }),
    }),
  }),
}));

const {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  validateUploadInput,
  DocumentError,
  MAX_FILE_SIZE_BYTES,
} = require('../services/documentService');

const OWNER = 'user-a';
const OTHER = 'user-b';

function makeFile(overrides = {}) {
  const buffer = Buffer.from('%PDF-1.4 test');
  return {
    originalname: 'passport.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

function makeSnapshot(data) {
  return { exists: Boolean(data), data: () => data };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSave.mockResolvedValue();
  mockFileDelete.mockResolvedValue();
  mockDocSet.mockResolvedValue();
  mockDocDelete.mockResolvedValue();
  mockGetSignedUrl.mockResolvedValue(['https://signed.example/file']);
});

describe('validateUploadInput', () => {
  it('accepts a valid file and document type', () => {
    expect(validateUploadInput(makeFile(), 'passport')).toEqual({});
  });

  it('rejects a missing file', () => {
    expect(validateUploadInput(undefined, 'passport')).toHaveProperty('file');
  });

  it('rejects a disallowed mime type', () => {
    const errors = validateUploadInput(makeFile({ mimetype: 'application/zip' }), 'passport');
    expect(errors).toHaveProperty('file');
  });

  it('rejects an oversized file', () => {
    const errors = validateUploadInput(
      makeFile({ size: MAX_FILE_SIZE_BYTES + 1 }),
      'passport'
    );
    expect(errors).toHaveProperty('file');
  });

  it('rejects an unknown document type', () => {
    expect(validateUploadInput(makeFile(), 'selfie')).toHaveProperty('documentType');
  });
});

describe('uploadDocument', () => {
  it('stores the file in Storage and metadata in Firestore', async () => {
    const result = await uploadDocument(OWNER, makeFile(), 'passport');

    expect(mockBucketFile).toHaveBeenCalledWith(
      `users/${OWNER}/documents/new-doc-id_passport.pdf`
    );
    expect(mockFileSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/pdf' })
    );
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUid: OWNER,
        fileName: 'passport.pdf',
        documentType: 'passport',
        uploadedAt: expect.any(String),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'new-doc-id', ownerUid: OWNER, documentType: 'passport' })
    );
    expect(result).not.toHaveProperty('storagePath');
  });

  it('removes the uploaded file if the Firestore write fails', async () => {
    mockDocSet.mockRejectedValue(new Error('firestore down'));

    await expect(uploadDocument(OWNER, makeFile(), 'passport')).rejects.toThrow('firestore down');
    expect(mockFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('sanitizes unsafe file names in the storage path', async () => {
    await uploadDocument(OWNER, makeFile({ originalname: '../../evil name.pdf' }), 'other');

    const usedPath = mockBucketFile.mock.calls[0][0];
    expect(usedPath).toBe(`users/${OWNER}/documents/new-doc-id_evil_name.pdf`);
  });
});

describe('listDocuments', () => {
  it('returns only the caller documents, newest first', async () => {
    const docs = [
      { id: 'd1', data: () => ({ ownerUid: OWNER, fileName: 'a.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }) },
      { id: 'd2', data: () => ({ ownerUid: OWNER, fileName: 'b.pdf', uploadedAt: '2026-02-01T00:00:00.000Z' }) },
    ];
    mockQueryGet.mockResolvedValue({ forEach: (cb) => docs.forEach(cb) });

    const result = await listDocuments(OWNER);

    expect(mockWhere).toHaveBeenCalledWith('ownerUid', '==', OWNER);
    expect(result.map((d) => d.id)).toEqual(['d2', 'd1']);
  });

  it('returns an empty array when the user has no documents', async () => {
    mockQueryGet.mockResolvedValue({ forEach: () => {} });
    expect(await listDocuments(OWNER)).toEqual([]);
  });
});

describe('getDocument', () => {
  const stored = {
    ownerUid: OWNER,
    fileName: 'passport.pdf',
    documentType: 'passport',
    contentType: 'application/pdf',
    size: 100,
    storagePath: 'users/user-a/documents/d1_passport.pdf',
    uploadedAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns metadata and a signed download URL for the owner', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(stored));

    const result = await getDocument(OWNER, 'd1');

    expect(mockBucketFile).toHaveBeenCalledWith(stored.storagePath);
    expect(result).toEqual(
      expect.objectContaining({
        id: 'd1',
        fileName: 'passport.pdf',
        downloadUrl: 'https://signed.example/file',
      })
    );
    expect(result).not.toHaveProperty('storagePath');
  });

  it('throws 404 when the document does not exist', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(undefined));

    await expect(getDocument(OWNER, 'missing')).rejects.toMatchObject({
      status: 404,
      code: 'document_not_found',
    });
  });

  it('throws 403 and does not sign a URL for another user document', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(stored));

    const err = await getDocument(OTHER, 'd1').catch((e) => e);

    expect(err).toBeInstanceOf(DocumentError);
    expect(err.status).toBe(403);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});

describe('deleteDocument', () => {
  const stored = {
    ownerUid: OWNER,
    storagePath: 'users/user-a/documents/d1_passport.pdf',
  };

  it('deletes both the Storage file and the Firestore record', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(stored));

    await deleteDocument(OWNER, 'd1');

    expect(mockBucketFile).toHaveBeenCalledWith(stored.storagePath);
    expect(mockFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(mockDocDelete).toHaveBeenCalledTimes(1);
  });

  it('throws 403 and deletes nothing for another user document', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(stored));

    await expect(deleteDocument(OTHER, 'd1')).rejects.toMatchObject({ status: 403 });
    expect(mockFileDelete).not.toHaveBeenCalled();
    expect(mockDocDelete).not.toHaveBeenCalled();
  });

  it('throws 404 when the document does not exist', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(undefined));

    await expect(deleteDocument(OWNER, 'missing')).rejects.toMatchObject({ status: 404 });
    expect(mockDocDelete).not.toHaveBeenCalled();
  });

  it('keeps the Firestore record if the Storage delete fails', async () => {
    mockDocGet.mockResolvedValue(makeSnapshot(stored));
    mockFileDelete.mockRejectedValue(new Error('storage down'));

    await expect(deleteDocument(OWNER, 'd1')).rejects.toThrow('storage down');
    expect(mockDocDelete).not.toHaveBeenCalled();
  });
});
