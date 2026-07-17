import React, { useCallback } from 'react';
import useDropZoneService from '../../hooks/useDropZoneService.js';
import './DropZone.css';

// ──────────────────────────────────────────────────────────────────────────────
// Switch this to 'react-dropzone' once the library ships a React 19 fix.
// See: https://github.com/react-dropzone/react-dropzone/issues/1427
const DROP_PROVIDER = 'native';
// ──────────────────────────────────────────────────────────────────────────────

// Helper to extract file extension/type
const getFileType = (file) => {
  if (file.type) {
    const parts = file.type.split('/');
    if (parts.length > 1) {
      const ext = parts[1].toUpperCase();
      if (ext.length <= 4) return ext;
    }
  }
  const extMatch = file.name.match(/\.([^.]+)$/);
  return extMatch ? extMatch[1].toUpperCase() : 'FILE';
};

// Helper to format file size with appropriate unit
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export default function DropZone({ filesList, setFilesList }) {
  // Shared handler for processing accepted files
  const processFiles = useCallback((files) => {
    setFilesList(files);
    files.forEach((file) => {
      console.log("File ready for P2P chunking:", file.name, file.size);
      const reader = new FileReader();
      reader.onload = (event) => {
        const _arrayBuffer = event.target.result;
        // TODO: Slice _arrayBuffer into chunks (e.g., 16KB) and stream over RTCDataChannel
        console.log(`Successfully buffered ${file.name}. Ready to stream.`);
      };
      reader.onerror = (err) => console.error("File reading error:", err);
      reader.readAsArrayBuffer(file);
    });
  }, [setFilesList]);

  // Handler to remove a file from the list
  const handleRemoveFile = useCallback((fileToRemove) => {
    setFilesList((prevList) =>
      prevList.filter((file) => (file.path || file.name) !== (fileToRemove.path || fileToRemove.name))
    );
  }, [setFilesList]);

  // Use the drop zone service with the configured provider
  const { getRootProps, getInputProps, isDragActive } = useDropZoneService({
    provider: DROP_PROVIDER,
    onFiles: processFiles,
  });

  return (
    <div className={`drop-zone-wrapper ${filesList.length > 0 ? 'has-files' : ''}`}>
      {/* Drag and Drop Zone Area */}
      <div
        {...getRootProps({
          className: `drop-zone ${isDragActive ? 'dragging' : ''}`
        })}
      >
        <input {...getInputProps()} />
        
        {/* Hardware Screw Details */}
        <span className="drop-zone-screw top-left" aria-hidden="true" />
        <span className="drop-zone-screw top-right" aria-hidden="true" />
        <span className="drop-zone-screw bottom-left" aria-hidden="true" />
        <span className="drop-zone-screw bottom-right" aria-hidden="true" />

        <div className="drop-zone-content">
          <div className="drop-status-led-group" aria-hidden="true">
            <span className={`decor-led ${isDragActive ? 'active' : filesList.length > 0 ? 'ready' : ''}`} />
            <span className="drop-status-text">
              {isDragActive 
                ? 'AWAITING_DROP' 
                : filesList.length > 0 
                ? 'QUEUE_ACTIVE' 
                : 'STATUS_READY'}
            </span>
          </div>

          <strong>
            {isDragActive ? (
              'Drop files here to load'
            ) : (
              <>
                Drag 'n' drop files here, or <span className="drop-action">browse</span>
              </>
            )}
          </strong>
          <p className="drop-hint">
            Direct browser-to-browser P2P file streaming. Files are never stored on any server.
          </p>
        </div>
      </div>

      {/* Selected Files Preview List */}
      {filesList.length > 0 && (
        <div className="drop-feedback">
          {/* Hardware Screw Details for the Twin Panel */}
          <span className="drop-zone-screw top-left" aria-hidden="true" />
          <span className="drop-zone-screw top-right" aria-hidden="true" />
          <span className="drop-zone-screw bottom-left" aria-hidden="true" />
          <span className="drop-zone-screw bottom-right" aria-hidden="true" />

          <div className="glyph-band" style={{ marginBottom: '1.25rem' }}>
            <span className="glyph-dot" aria-hidden="true" />
            <span className="file-meta">MODULE.P2P.FILE_QUEUE // READY</span>
          </div>
          
          <div className="file-list-container">
            <ul className="file-list">
              {filesList.map((file) => (
                <li key={file.path || file.name} className="file-item">
                  <div className="file-info-group">
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <span className="file-type-label">{getFileType(file)} FILE</span>
                  </div>
                  <div className="file-meta-group">
                    <span className="file-size-badge">
                      {formatFileSize(file.size)}
                    </span>
                    <button 
                      className="file-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(file);
                      }}
                      title="Remove file"
                      aria-label={`Remove ${file.name}`}
                    >
                      &times;
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
