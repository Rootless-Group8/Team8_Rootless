import { useState } from 'react';
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

/**
 * DocumentUploadPage
 * The screen where a user uploads their supporting documents
 * (passport scan, proof of funds, travel itinerary, etc.).
 *
 * Uploads go to the real backend (POST /api/documents — see
 * backend/src/routes/documentRoutes.js), which stores the file in
 * Firebase Storage and its metadata in Firestore. The FileUpload
 * component itself doesn't know or care that this changed from the
 * previous simulated version — its `onUpload(file)` contract is
 * identical either way.
 */
export default function DocumentUploadPage() {
  // One documentType applies to the whole upload session rather than
  // per-file, since FileUpload's onUpload only receives the file itself.
  // Good enough for now; a per-file type picker would need a FileUpload
  // prop change, which felt like more scope than this fix needed.
  const [documentType, setDocumentType] = useState('passport');

  async function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);

    // apiFetch handles getting the Firebase ID token and setting the
    // Authorization header; FormData as the body means the browser sets
    // the multipart Content-Type (with boundary) automatically — don't
    // set it manually here, that would break the upload.
    await apiFetch('/api/documents', {
      method: 'POST',
      body: formData,
    });
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

      <FileUpload
        label="Drag your documents here, or browse to upload"
        acceptedFileTypes={['application/pdf', 'image/jpeg', 'image/png']}
        maxFileSizeMB={10}
        multiple={true}
        onUpload={uploadDocument}
      />
    </div>
  );
}
