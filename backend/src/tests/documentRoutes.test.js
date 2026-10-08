const request = require('supertest');
const express = require('express');

// The real verifyFirebaseToken is covered by the Sprint 2 auth tests. Here it
// is replaced with a stand-in that rejects requests without a Bearer token and
// otherwise treats the token text as the caller's UID, so tests can act as
// different users.
jest.mock('../middleware/authMiddleware', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required.',
      });
    }
    req.firebaseUser = { uid: header.slice(7) };
    return next();
  },
}));

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

jest.mock('../services/documentService', () => {
  const actual = jest.requireActual('../services/documentService');
  return {
    ...actual,
    uploadDocument: jest.fn(),
    listDocuments: jest.fn(),
    getDocument: jest.fn(),
    deleteDocument: jest.fn(),
  };
});

const documentService = require('../services/documentService');
const documentRoutes = require('../routes/documentRoutes');

const { DocumentError } = documentService;

const app = express();
app.use(express.json());
app.use('/api/documents', documentRoutes);

const pdf = Buffer.from('%PDF-1.4 test');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authentication', () => {
  it.each([
    ['post', '/api/documents'],
    ['get', '/api/documents'],
    ['get', '/api/documents/d1'],
    ['delete', '/api/documents/d1'],
  ])('%s %s returns 401 without a token', async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
    expect(documentService.uploadDocument).not.toHaveBeenCalled();
    expect(documentService.listDocuments).not.toHaveBeenCalled();
    expect(documentService.getDocument).not.toHaveBeenCalled();
    expect(documentService.deleteDocument).not.toHaveBeenCalled();
  });
});

describe('POST /api/documents', () => {
  it('uploads a file and returns 201 with metadata', async () => {
    documentService.uploadDocument.mockResolvedValue({
      id: 'd1',
      fileName: 'passport.pdf',
      documentType: 'passport',
      ownerUid: 'user-a',
    });

    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer user-a')
        .field('documentType', 'passport')
        .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.document).toEqual(expect.objectContaining({ id: 'd1', ownerUid: 'user-a' }));
    expect(documentService.uploadDocument).toHaveBeenCalledWith(
        'user-a',
        expect.objectContaining({ originalname: 'passport.pdf', mimetype: 'application/pdf' }),
        'passport'
    );
  });

  it('returns 400 when no file is sent', async () => {
    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer user-a')
        .field('documentType', 'passport');

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('file');
    expect(documentService.uploadDocument).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid document type', async () => {
    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer user-a')
        .field('documentType', 'selfie')
        .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('documentType');
  });

  it('returns 400 for a disallowed file type', async () => {
    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer user-a')
        .field('documentType', 'passport')
        .attach('file', Buffer.from('PK'), { filename: 'a.zip', contentType: 'application/zip' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('file');
  });

  it('returns 500 when the service fails unexpectedly', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    documentService.uploadDocument.mockRejectedValue(new Error('boom'));

    const res = await request(app)
        .post('/api/documents')
        .set('Authorization', 'Bearer user-a')
        .field('documentType', 'passport')
        .attach('file', pdf, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
    console.error.mockRestore();
  });
});

describe('GET /api/documents', () => {
  it('lists the authenticated user documents', async () => {
    documentService.listDocuments.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);

    const res = await request(app)
        .get('/api/documents')
        .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(documentService.listDocuments).toHaveBeenCalledWith('user-a');
  });
});

describe('GET /api/documents/:id', () => {
  it('returns metadata and a download URL for the owner', async () => {
    documentService.getDocument.mockResolvedValue({
      id: 'd1',
      downloadUrl: 'https://signed.example/file',
    });

    const res = await request(app)
        .get('/api/documents/d1')
        .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body.document.downloadUrl).toBe('https://signed.example/file');
    expect(documentService.getDocument).toHaveBeenCalledWith('user-a', 'd1');
  });

  it('returns 403 when accessing another user document', async () => {
    documentService.getDocument.mockRejectedValue(
        new DocumentError(403, 'forbidden', 'You do not have access to this document.')
    );

    const res = await request(app)
        .get('/api/documents/d1')
        .set('Authorization', 'Bearer user-b');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(documentService.getDocument).toHaveBeenCalledWith('user-b', 'd1');
  });

  it('returns 404 when the document does not exist', async () => {
    documentService.getDocument.mockRejectedValue(
        new DocumentError(404, 'document_not_found', 'Document not found.')
    );

    const res = await request(app)
        .get('/api/documents/missing')
        .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('deletes the document for the owner', async () => {
    documentService.deleteDocument.mockResolvedValue();

    const res = await request(app)
        .delete('/api/documents/d1')
        .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Document deleted.', id: 'd1' });
    expect(documentService.deleteDocument).toHaveBeenCalledWith('user-a', 'd1');
  });

  it('returns 403 when deleting another user document', async () => {
    documentService.deleteDocument.mockRejectedValue(
        new DocumentError(403, 'forbidden', 'You do not have access to this document.')
    );

    const res = await request(app)
        .delete('/api/documents/d1')
        .set('Authorization', 'Bearer user-b');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});