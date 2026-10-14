import { useEffect, useState } from 'react';
import FileUpload from '../components/FileUpload';
import { apiFetch } from '../lib/apiClient';
import './DocumentUploadPage.css';

// Matches backend/src/services/documentService.js's DOCUMENT_TYPES enum
// exactly — the backend rejects any value not in this list with a 400.
const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'visa_form', label: 'Visa Application Form' },
  { value: 'supporting_document', label: 'Supporting Document' },
  { value: 'identification', label: 'Other Identification' },
  { value: 'financial_record', label: 'Financial Record' },
  { value: 'other', label: 'Other' },
];

function formatExpiration(isoDateString) {
  if (!isoDateString) return null;
  return new Date(isoDateString).toLocaleDateString();
}

export default function DocumentUploadPage() {
  // One documentType applies to the whole upload session rather than
  // per-file, since FileUpload's onUpload only receives the file itself.
  // Good enough for now; a per-file type picker would need a FileUpload
  // prop change, which felt like more scope than this fix needed.
  const [documentType, setDocumentType] = useState('passport');
  const [expirationDate, setExpirationDate] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);

  async function loadDocuments() {
    setLoadingDocuments(true);
    try {
      const data = await apiFetch('/api/documents');
      setDocuments(data?.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocuments(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch-on-mount; loadDocuments is also reused standalone after a successful upload.
    loadDocuments();
  }, []);

  async function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    if (expirationDate) {
      formData.append('expirationDate', expirationDate);
    }

    // apiFetch handles getting the Firebase ID token and setting the
    // Authorization header; FormData as the body means the browser sets
    // the multipart Content-Type (with boundary) automatically — don't
    // set it manually here, that would break the upload.
    await apiFetch('/api/documents', {
      method: 'POST',
      body: formData,
    });

    await loadDocuments();
  }

  return (
    <div className="document-upload-page">
      <h1 className="document-upload-page__title">Upload your documents</h1>
      <p className="document-upload-page__description">
        Add your passport scan and any other supporting documents. We accept PDF, JPEG, and PNG
        files up to 10MB.
      </p>

      <div className="form-field">
        <label htmlFor="documentType">Document type</label>
        <select id="documentType" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="expirationDate">Expiration date (optional)</label>
        <input
          id="expirationDate"
          type="date"
          value={expirationDate}
          onChange={(e) => setExpirationDate(e.target.value)}
        />
      </div>

      <FileUpload
        label="Drag your documents here, or browse to upload"
        acceptedFileTypes={['application/pdf', 'image/jpeg', 'image/png']}
        maxFileSizeMB={10}
        multiple={true}
        onUpload={uploadDocument}
      />

      <h2 className="document-list-heading">Your documents</h2>
      {loadingDocuments ? (
        <p className="loading-message">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="placeholder-note">No documents uploaded yet.</p>
      ) : (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id} id={`doc-${doc.id}`} className="document-list-item">
              <span className="document-list-item__name">{doc.fileName}</span>
              {doc.expirationDate && (
                <span className="document-list-item__expiration">
                  Expires {formatExpiration(doc.expirationDate)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
