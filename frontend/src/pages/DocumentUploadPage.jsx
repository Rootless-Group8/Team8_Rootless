import React from 'react';
import FileUpload from '../components/FileUpload';
import './DocumentUploadPage.css';

/**
 * DocumentUploadPage
 * The screen where a user uploads their supporting documents
 * (passport scan, proof of funds, travel itinerary, etc.).
 *
 * This page currently simulates the upload (see `simulateUpload`
 * below) since real storage wiring — e.g. sending files to Firebase
 * Storage — is a separate task. Swap `simulateUpload` for a real
 * upload function once that's ready; the FileUpload component
 * doesn't need to change at all.
 */
export default function DocumentUploadPage() {
  // TODO: replace with a real upload call once Firebase Storage
  // wiring exists, e.g.:
  //   await uploadBytes(storageRef(storage, `documents/${file.name}`), file);
  function simulateUpload(file) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulates an occasional failure so the error state is easy
        // to see while testing. Remove this once real uploads are wired in.
        if (file.name.toLowerCase().includes('fail')) {
          reject(new Error('Upload failed. Try again.'));
        } else {
          resolve();
        }
      }, 1200);
    });
  }

  return (
    <div className="document-upload-page">
      <h1 className="document-upload-page__title">Upload your documents</h1>
      <p className="document-upload-page__description">
        Add your passport scan and any other supporting documents. We accept PDF files
        for passports and travel documents.
      </p>

      <FileUpload
        label="Drag your documents here, or browse to upload"
        acceptedFileTypes={['application/pdf']}
        maxFileSizeMB={10}
        multiple={true}
        onUpload={simulateUpload}
      />
    </div>
  );
}
