import React, { useRef, useState } from 'react';
import Button from './Button';
import ProgressIndicator from './ProgressIndicator';
import './FileUpload.css';

/**
 * FileUpload
 * A drag-and-drop (or click-to-browse) file uploader with a built-in
 * file list. Each file tracks its own status — uploading, uploaded,
 * or error — so the list stays accurate even if some files succeed
 * and others fail.
 *
 * This component is UI only: it doesn't know how to actually store a
 * file anywhere. Pass in an `onUpload` function that does the real
 * work (e.g. sending the file to Firebase Storage) and this component
 * handles the rest — showing progress, success, errors, and letting
 * the user remove files.
 *
 * Props:
 *  - onUpload         (function(file) => Promise, required)
 *      Called once per accepted file. Resolve the promise on success,
 *      reject it (optionally with an Error whose `.message` explains
 *      why) on failure.
 *  - acceptedFileTypes (array of MIME types)
 *      Default: ['application/pdf', 'image/jpeg', 'image/png']
 *  - maxFileSizeMB    (number)  Default: 10
 *  - multiple         (bool)    Whether more than one file can be
 *                                selected/dropped at once. Default: true
 *  - label            (string)  Heading text shown in the drop zone.
 *  - helperText       (string)  Small text under the label, e.g. listing
 *                                accepted formats. If omitted, one is
 *                                generated from acceptedFileTypes/maxFileSizeMB.
 *  - onFilesChange    (function(files), optional)
 *      Called any time the file list changes, in case a parent screen
 *      needs to know the current state (e.g. to enable a "Continue"
 *      button once everything required is uploaded).
 *
 * ---- Usage example ----
 *
 *   import FileUpload from './components/FileUpload';
 *
 *   async function uploadToStorage(file) {
 *     // e.g. real Firebase Storage call
 *     await uploadBytes(ref(storage, `documents/${file.name}`), file);
 *   }
 *
 *   <FileUpload
 *     label="Upload your passport scan"
 *     acceptedFileTypes={['application/pdf']}
 *     maxFileSizeMB={5}
 *     multiple={false}
 *     onUpload={uploadToStorage}
 *   />
 */
export default function FileUpload({
  onUpload,
  acceptedFileTypes = ['application/pdf', 'image/jpeg', 'image/png'],
  maxFileSizeMB = 10,
  multiple = true,
  label = 'Drag files here, or browse to upload',
  helperText,
  onFilesChange,
}) {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const defaultHelperText = `Accepted: ${acceptedFileTypes
    .map((t) => t.split('/')[1]?.toUpperCase() || t)
    .join(', ')} · Max ${maxFileSizeMB}MB`;

  function updateFiles(updater) {
    setFiles((prev) => {
      const next = updater(prev);
      onFilesChange?.(next);
      return next;
    });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleIncomingFiles(fileList) {
    const incoming = Array.from(fileList);
    const toAdd = multiple ? incoming : incoming.slice(0, 1);

    toAdd.forEach((file) => {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const tooBig = file.size > maxFileSizeMB * 1024 * 1024;
      const wrongType = acceptedFileTypes.length > 0 && !acceptedFileTypes.includes(file.type);

      if (tooBig || wrongType) {
        const errorMessage = tooBig
          ? `File is larger than ${maxFileSizeMB}MB.`
          : 'Unsupported file type.';

        updateFiles((prev) => [
          ...prev,
          { id, name: file.name, size: file.size, status: 'error', errorMessage },
        ]);
        return;
      }

      updateFiles((prev) => [...prev, { id, name: file.name, size: file.size, status: 'uploading' }]);

      Promise.resolve(onUpload(file))
        .then(() => {
          updateFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: 'success' } : f))
          );
        })
        .catch((err) => {
          updateFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? { ...f, status: 'error', errorMessage: err?.message || 'Upload failed.' }
                : f
            )
          );
        });
    });
  }

  function handleRemove(id) {
    updateFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="ui-file-upload">
      <div
        className={`ui-file-upload__dropzone ${isDragOver ? 'ui-file-upload__dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <p className="ui-file-upload__label">{label}</p>
        <p className="ui-file-upload__helper">{helperText || defaultHelperText}</p>
        <Button label="Browse files" onClick={() => inputRef.current?.click()} variant="secondary" />
        <input
          ref={inputRef}
          type="file"
          className="ui-file-upload__input"
          accept={acceptedFileTypes.join(',')}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files?.length) handleIncomingFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <ul className="ui-file-list">
        {files.length === 0 && <li className="ui-file-list__empty">No files uploaded yet.</li>}

        {files.map((f) => (
          <li key={f.id} className="ui-file-list__item">
            <div className="ui-file-list__info">
              <span className="ui-file-list__name">{f.name}</span>
              <span className="ui-file-list__size">{formatSize(f.size)}</span>
            </div>

            <div className="ui-file-list__status">
              {f.status === 'uploading' && (
                <div className="ui-file-list__progress">
                  <ProgressIndicator />
                </div>
              )}
              {f.status === 'success' && <span className="ui-file-list__badge ui-file-list__badge--success">Uploaded</span>}
              {f.status === 'error' && (
                <span className="ui-file-list__badge ui-file-list__badge--error">
                  {f.errorMessage || 'Failed'}
                </span>
              )}
              <button
                type="button"
                className="ui-file-list__remove"
                onClick={() => handleRemove(f.id)}
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
