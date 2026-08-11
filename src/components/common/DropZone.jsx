import React, { useState, useCallback } from 'react';
import useDropZoneService from '../../hooks/useDropZoneService.js';
import ThemedMediaPlayer from './ThemedMediaPlayer.jsx';
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

// Helper to detect playable/viewable media types (music & images only)
const getMediaType = (filename) => {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus', 'wma'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  return null;
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
  const [activeMediaModal, setActiveMediaModal] = useState(null);

  const handleOpenMedia = (file) => {
    const mediaType = getMediaType(file.name);
    if (!mediaType) return;
    const url = URL.createObjectURL(file);
    setActiveMediaModal({ file, url, type: mediaType });
  };
  // Shared handler for processing accepted files
  const processFiles = useCallback((incomingFiles) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    // Assign a unique runtime ID to each file instance for safe keying and deletion
    const processedFiles = incomingFiles.map((file, idx) => {
      if (!file.id) {
        file.id = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${idx}`;
      }
      return file;
    });

    setFilesList((prevList) => [...prevList, ...processedFiles]);
  }, [setFilesList]);

  // Handler to remove a single file from the list by unique ID
  const handleRemoveFile = useCallback((fileToRemove) => {
    setFilesList((prevList) =>
      prevList.filter((file) => (file.id || file.name) !== (fileToRemove.id || fileToRemove.name))
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
              {filesList.map((file, idx) => {
                const mediaType = getMediaType(file.name);

                return (
                  <li key={file.id || `${file.name}-${idx}`} className="file-item">
                    <div className="file-info-group">
                      <span className="file-name" title={file.name}>{file.name}</span>
                      <span className="file-type-label">{getFileType(file)} FILE</span>
                    </div>
                    <div className="file-meta-group">
                      {mediaType && (
                        <button
                          type="button"
                          className="media-preview-btn font-dot"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenMedia(file);
                          }}
                        >
                          {mediaType === 'video' ? '▶ PLAY' : mediaType === 'audio' ? '♫ AUDIO' : '👁 VIEW'}
                        </button>
                      )}
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
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Themed Media Player Modal */}
      {activeMediaModal && (
        <ThemedMediaPlayer
          file={activeMediaModal.file}
          mediaUrl={activeMediaModal.url}
          mediaType={activeMediaModal.type}
          onClose={() => {
            if (activeMediaModal?.url) {
              URL.revokeObjectURL(activeMediaModal.url);
            }
            setActiveMediaModal(null);
          }}
        />
      )}
    </div>
  );
}
