import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ThemedMediaPlayer.css';
import { getChunksForFile } from '../../utils/storageDB.js';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const minStr = mins < 10 ? '0' + mins : '' + mins;
  const secStr = secs < 10 ? '0' + secs : '' + secs;
  return minStr + ':' + secStr;
};

const getMediaMimeType = (filename) => {
  if (!filename) return '';
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
};

export default function ThemedMediaPlayer({ file, mediaType, fileStatus, peerId, fileIndex, mediaUrl: propMediaUrl, onClose }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hudNotice, setHudNotice] = useState(null);
  const [mediaUrl, setMediaUrl] = useState(propMediaUrl || '');
  const [isBuffering, setIsBuffering] = useState(false);

  const mediaRef = useRef(null);
  const deckRef = useRef(null);
  const hideTimerRef = useRef(null);
  const currentBlobUrlRef = useRef('');

  const triggerHudNotice = (text) => { setHudNotice({ id: Date.now(), text }); };

  const resetControlsTimeout = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFullscreen && isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
    }
  };

  // Build Blob URL from IndexedDB chunks for music & image
  const rebuildBlobUrl = useCallback(() => {
    if (propMediaUrl) {
      setMediaUrl(propMediaUrl);
      setIsBuffering(false);
      return;
    }
    if (!peerId && peerId !== 0) return;

    getChunksForFile(peerId, fileIndex).then((chunks) => {
      if (!chunks || chunks.length === 0) return;
      const mimeType = getMediaMimeType(file?.name || '');
      const blob = new Blob(chunks, { type: mimeType });
      const newUrl = URL.createObjectURL(blob);
      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = newUrl;
      setMediaUrl(newUrl);
      setIsBuffering(false);
    });
  }, [peerId, fileIndex, file, propMediaUrl]);

  useEffect(() => {
    rebuildBlobUrl();
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = '';
      }
    };
  }, [rebuildBlobUrl]);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    const handleFSChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('webkitfullscreenchange', handleFSChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
    };
  }, [onClose]);

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [isFullscreen, isPlaying]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      const promise = mediaRef.current.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch((err) => {
          console.warn("Audio play request handled:", err.message);
        });
      }
    }
    resetControlsTimeout();
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
      setDuration(mediaRef.current.duration || 0);
    }
  };

  const handleSeek = (e) => {
    const t = parseFloat(e.target.value);
    if (mediaRef.current) {
      mediaRef.current.currentTime = t;
      setCurrentTime(t);
    }
    resetControlsTimeout();
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (mediaRef.current) {
      mediaRef.current.volume = v;
      setIsMuted(v === 0);
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    if (!mediaRef.current) return;
    mediaRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
    resetControlsTimeout();
  };

  const handleSaveToDisk = () => {
    if (propMediaUrl) {
      const a = document.createElement('a'); a.href = propMediaUrl; a.download = file?.name || 'file';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      triggerHudNotice('SAVING FILE TO DISK...');
      return;
    }
    if (!file || !file.name || (!peerId && peerId !== 0)) return;
    getChunksForFile(peerId, fileIndex).then((chunks) => {
      if (!chunks || chunks.length === 0) return;
      const blob = new Blob(chunks, { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      triggerHudNotice('SAVING FILE TO DISK...');
    });
  };

  const BufferingOverlay = () => (
    <div className="media-buffering-overlay">
      <div className="buffering-spinner" />
      <div className="buffering-title font-dot">BUFFERING STREAM</div>
      <div className="buffering-sub font-dot">
        {mediaType === 'image' ? 'AWAITING COMPLETE IMAGE DATA...' : 'RECEIVING CHUNKS // PLEASE WAIT...'}
      </div>
    </div>
  );

  return (
    <div className="themed-media-overlay" onClick={onClose}>
      <div
        ref={deckRef}
        className={"themed-media-deck panel" + (isFullscreen ? ' is-fullscreen' : '')}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetControlsTimeout}
        onTouchStart={resetControlsTimeout}
      >
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        <div className={"media-deck-header" + (isFullscreen && !controlsVisible ? ' controls-hidden' : '')}>
          <div className="media-header-left">
            <span className={"decor-led " + (isPlaying ? 'active' : isBuffering ? 'blink' : 'ready')} />
            <div className="media-title-group">
              <span className="media-deck-tag font-dot">MEDIA.PLAYER // {mediaType ? mediaType.toUpperCase() : ''}</span>
              <h3 className="media-filename" title={file && file.name}>{file && file.name}</h3>
            </div>
          </div>
          <div className="media-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isBuffering && (
              <span className="font-dot" style={{ fontSize: '0.65rem', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                ⟳ BUFFERING...
              </span>
            )}
            <button type="button" className="media-save-btn font-dot" onClick={handleSaveToDisk} title="Download/Save to Disk">
              💾 SAVE FILE
            </button>
            <button type="button" className="media-close-btn font-dot" onClick={onClose} aria-label="Close Player">
              CLOSE [ X ]
            </button>
          </div>
        </div>

        {/* Audio Mode */}
        {mediaType === 'audio' && (
          <div className="media-viewport-container audio-mode">
            {!mediaUrl ? (
              <BufferingOverlay />
            ) : (
              <audio
                ref={mediaRef}
                src={mediaUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => setDuration(mediaRef.current?.duration || 0)}
                onCanPlay={() => setIsBuffering(false)}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => setIsBuffering(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                preload="auto"
              />
            )}
            <div className="audio-hardware-deck">
              <div className={"audio-spinning-dial" + (isPlaying ? ' spinning' : '')}>
                <div className="dial-core" />
                <div className="dial-waveform-overlay">
                  <div className="waveform-line line-1" />
                  <div className="waveform-line line-2" />
                  <div className="waveform-line line-3" />
                  <div className="waveform-line line-4" />
                  <div className="waveform-line line-5" />
                </div>
              </div>
              <div className="audio-spec-info">
                <span className="audio-status-label font-dot">
                  {!mediaUrl
                    ? 'AUDIO.BUFFERING // RECEIVING...'
                    : isPlaying ? 'AUDIO.STREAMING // ACTIVE' : 'AUDIO.STANDBY // PAUSED'}
                </span>
                <span className="audio-time font-dot">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>
            <div className="custom-media-controls">
              <div className="controls-row-top">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="media-scrubber"
                />
              </div>
              <div className="controls-row-bottom">
                <button type="button" className="control-btn play-main font-dot" onClick={togglePlay} disabled={!mediaUrl}>
                  {isPlaying ? 'PAUSE STREAM' : 'START PLAYBACK'}
                </button>
                <div className="controls-group-right">
                  <button type="button" className="control-btn-icon font-dot" onClick={toggleMute}>{isMuted || volume === 0 ? 'MUTED' : 'VOL'}</button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image Mode */}
        {mediaType === 'image' && (
          <div className="media-viewport-container image-mode">
            <div className="image-viewport-wrapper">
              {!mediaUrl ? (
                <BufferingOverlay />
              ) : (
                <img
                  src={mediaUrl}
                  alt={file && file.name}
                  className="media-image-element"
                  style={{ transform: 'scale(' + zoom + ') rotate(' + rotation + 'deg)' }}
                />
              )}
            </div>
            {mediaUrl && (
              <div className="image-toolbar font-dot">
                <div className="image-tools-left">
                  <button type="button" className="control-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>ZOOM -</button>
                  <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                  <button type="button" className="control-btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>ZOOM +</button>
                  <button type="button" className="control-btn" onClick={() => setZoom(1)}>RESET</button>
                </div>
                <div className="image-tools-right">
                  <button type="button" className="control-btn" onClick={() => setRotation(r => (r + 90) % 360)}>ROTATE 90°</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
