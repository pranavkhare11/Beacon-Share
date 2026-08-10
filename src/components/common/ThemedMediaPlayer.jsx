import React, { useState, useRef, useEffect } from 'react';
import './ThemedMediaPlayer.css';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export default function ThemedMediaPlayer({ file, mediaUrl, mediaType, onClose }) {
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

  // Audio track stream selector state
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [showAudioDropdown, setShowAudioDropdown] = useState(false);

  const mediaRef = useRef(null);
  const deckRef = useRef(null);
  const videoWrapperRef = useRef(null);
  const hideTimerRef = useRef(null);

  const lastTapRef = useRef({ time: 0, xPercent: 0 });
  const singleTapTimerRef = useRef(null);

  const triggerHudNotice = (text) => {
    setHudNotice({ id: Date.now(), text });
  };

  const resetControlsTimeout = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFullscreen && isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [onClose]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isFullscreen, isPlaying]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
    resetControlsTimeout();
  };

  // Viewport Touch / Click Gesture Logic
  // Mid 34%: Pause/Play | Left 33%: Hide UI (Double-tap: -5s) | Right 33%: Hide UI (Double-tap: +10s)
  const handleViewportClick = (e) => {
    if (!videoWrapperRef.current) return;
    const rect = videoWrapperRef.current.getBoundingClientRect();
    const clickX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.width / 2);
    const relativeX = clickX - rect.left;
    const xPercent = (relativeX / rect.width) * 100;

    const now = Date.now();
    const timeDiff = now - lastTapRef.current.time;
    const lastPercent = lastTapRef.current.xPercent;

    const isLeftZone = xPercent < 33;
    const isRightZone = xPercent > 67;
    const isMiddleZone = xPercent >= 33 && xPercent <= 67;
    const isSameZone = (isLeftZone && lastPercent < 33) || (isRightZone && lastPercent > 67);

    // Double Tap detection
    if (timeDiff < 300 && isSameZone) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      lastTapRef.current = { time: 0, xPercent: 0 };

      if (isLeftZone) {
        // Rewind 5 seconds
        if (mediaRef.current) {
          const newTime = Math.max(0, (mediaRef.current.currentTime || 0) - 5);
          mediaRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
        triggerHudNotice('-5s ↺ REWIND');
      } else if (isRightZone) {
        // Skip 10 seconds
        if (mediaRef.current) {
          const newTime = Math.min(duration || 99999, (mediaRef.current.currentTime || 0) + 10);
          mediaRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
        triggerHudNotice('+10s ↻ SKIP');
      }
      resetControlsTimeout();
      return;
    }

    lastTapRef.current = { time: now, xPercent };

    // Single Tap delay handler
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      if (isMiddleZone) {
        // Tap center: Toggle Play / Pause
        togglePlay();
        triggerHudNotice(isPlaying ? 'PAUSE' : 'PLAY');
      } else {
        // Tap left or right: Toggle/Hide Player UI controls
        setControlsVisible(prev => !prev);
      }
    }, 260);

    resetControlsTimeout();
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
      setDuration(mediaRef.current.duration || 0);
    }
  };

  // Detect native audio tracks (only works in Safari & Chrome with experimental flag)
  const detectAudioTracks = () => {
    if (!mediaRef.current) return;
    const videoEl = mediaRef.current;
    const tracks = videoEl.audioTracks || videoEl.webkitAudioTracks;

    if (tracks && tracks.length > 1) {
      const list = [];
      for (let i = 0; i < tracks.length; i++) {
        const trk = tracks[i];
        list.push({
          index: i,
          label: trk.label || (trk.language ? `Audio (${trk.language.toUpperCase()})` : `Track ${i + 1}`),
          language: trk.language || '',
          enabled: trk.enabled
        });
        if (trk.enabled) setSelectedTrackIndex(i);
      }
      setAudioTracks(list);
    }
  };

  const handleLoadedMetadata = () => {
    handleTimeUpdate();
    detectAudioTracks();
  };

  const handleSelectAudioTrack = (index) => {
    setSelectedTrackIndex(index);
    setShowAudioDropdown(false);

    if (!mediaRef.current) return;
    const videoEl = mediaRef.current;
    const tracks = videoEl.audioTracks || videoEl.webkitAudioTracks;

    if (tracks && tracks.length > index) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = (i === index);
      }
      const label = tracks[index]?.label || tracks[index]?.language || `Track ${index + 1}`;
      triggerHudNotice(`AUDIO: ${label}`);
    } else {
      triggerHudNotice('AUDIO SWITCH NOT SUPPORTED');
    }
  };

  const handleSeek = (e) => {
    const seekTime = parseFloat(e.target.value);
    if (mediaRef.current) {
      mediaRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
    resetControlsTimeout();
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (mediaRef.current) {
      mediaRef.current.volume = val;
      setIsMuted(val === 0);
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    if (!mediaRef.current) return;
    if (isMuted) {
      mediaRef.current.muted = false;
      setIsMuted(false);
    } else {
      mediaRef.current.muted = true;
      setIsMuted(true);
    }
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    if (!deckRef.current) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (deckRef.current.requestFullscreen) {
        deckRef.current.requestFullscreen();
      } else if (deckRef.current.webkitRequestFullscreen) {
        deckRef.current.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  const handleSaveToDisk = () => {
    if (!mediaUrl || !file?.name) return;
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    triggerHudNotice('SAVING FILE TO DISK...');
  };

  return (
    <div className="themed-media-overlay" onClick={onClose}>
      <div 
        ref={deckRef} 
        className={`themed-media-deck panel ${isFullscreen ? 'is-fullscreen' : ''}`} 
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetControlsTimeout}
        onTouchStart={resetControlsTimeout}
      >
        {/* Hardware Screws */}
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        {/* Modal Header Bar */}
        <div className={`media-deck-header ${isFullscreen && !controlsVisible ? 'controls-hidden' : ''}`}>
          <div className="media-header-left">
            <span className={`decor-led ${isPlaying ? 'active' : 'ready'}`} />
            <div className="media-title-group">
              <span className="media-deck-tag font-dot">MEDIA.PLAYER // {mediaType.toUpperCase()}</span>
              <h3 className="media-filename" title={file?.name}>{file?.name}</h3>
            </div>
          </div>
          <div className="media-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mediaUrl && (
              <button type="button" className="media-save-btn font-dot" onClick={handleSaveToDisk} title="Download/Save to Disk">
                💾 SAVE FILE
              </button>
            )}
            <button type="button" className="media-close-btn font-dot" onClick={onClose} aria-label="Close Player">
              CLOSE [ X ]
            </button>
          </div>
        </div>

        {/* Video Player */}
        {mediaType === 'video' && (
          <div className="media-viewport-container video-mode">
            <div 
              ref={videoWrapperRef} 
              className="video-wrapper"
              onClick={handleViewportClick}
            >
              <video
                ref={mediaRef}
                src={mediaUrl}
                className="media-video-element"
                playsInline
                webkit-playsinline="true"
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={detectAudioTracks}
                onPlay={() => {
                  setIsPlaying(true);
                  detectAudioTracks();
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                controls={false}
              />

              {/* HUD Notice Feedback Overlay */}
              {hudNotice && (
                <div key={hudNotice.id} className="player-hud-notice font-dot">
                  {hudNotice.text}
                </div>
              )}
            </div>

            {/* Custom Control Bar */}
            <div className={`custom-media-controls ${isFullscreen && !controlsVisible ? 'controls-hidden' : ''}`}>
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
                <div className="controls-group-left">
                  <button type="button" className="control-btn font-dot" onClick={togglePlay}>
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>

                  <div className="media-time-display font-dot">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                <div className="controls-group-right">
                  {/* Audio Track Selector - only when native multi-track detected */}
                  {audioTracks.length > 1 && (
                    <div className="audio-track-selector-wrapper" style={{ position: 'relative' }}>
                      <button 
                        type="button" 
                        className="control-btn-icon audio-track-btn font-dot" 
                        onClick={() => setShowAudioDropdown(prev => !prev)}
                        title="Audio Track Selector"
                      >
                        🎧 {audioTracks[selectedTrackIndex]?.label || 'AUDIO'} ▼
                      </button>

                      {showAudioDropdown && (
                        <div className="audio-track-dropdown font-dot">
                          <div className="dropdown-title">SELECT AUDIO TRACK</div>
                          {audioTracks.map((trk) => (
                            <button
                              key={trk.index}
                              type="button"
                              className={`dropdown-item ${selectedTrackIndex === trk.index ? 'active' : ''}`}
                              onClick={() => handleSelectAudioTrack(trk.index)}
                            >
                              {selectedTrackIndex === trk.index && <span className="decor-led active" />}
                              <span>{trk.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button type="button" className="control-btn-icon font-dot" onClick={toggleMute}>
                    {isMuted || volume === 0 ? 'MUTED' : 'VOL'}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                  />

                  <button type="button" className="control-btn font-dot" onClick={toggleFullscreen}>
                    {isFullscreen ? 'EXIT FULL' : 'FULL'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audio Player */}
        {mediaType === 'audio' && (
          <div className="media-viewport-container audio-mode">
            <audio
              ref={mediaRef}
              src={mediaUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />

            {/* Hardware Waveform Cassette Deck */}
            <div className="audio-hardware-deck">
              <div className={`audio-spinning-dial ${isPlaying ? 'spinning' : ''}`}>
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
                  {isPlaying ? 'AUDIO.STREAMING // ACTIVE' : 'AUDIO.STANDBY // PAUSED'}
                </span>
                <span className="audio-time font-dot">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>

            {/* Custom Audio Scrubber & Controls */}
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
                <button type="button" className="control-btn play-main font-dot" onClick={togglePlay}>
                  {isPlaying ? 'PAUSE STREAM' : 'START PLAYBACK'}
                </button>

                <div className="controls-group-right">
                  <button type="button" className="control-btn-icon font-dot" onClick={toggleMute}>
                    {isMuted || volume === 0 ? 'MUTED' : 'VOL'}
                  </button>
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

        {/* Image Viewer */}
        {mediaType === 'image' && (
          <div className="media-viewport-container image-mode">
            <div className="image-viewport-wrapper">
              <img
                src={mediaUrl}
                alt={file?.name}
                className="media-image-element"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`
                }}
              />
            </div>

            <div className="image-toolbar font-dot">
              <div className="image-tools-left">
                <button type="button" className="control-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
                  ZOOM -
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button type="button" className="control-btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
                  ZOOM +
                </button>
                <button type="button" className="control-btn" onClick={() => setZoom(1)}>
                  RESET
                </button>
              </div>

              <div className="image-tools-right">
                <button type="button" className="control-btn" onClick={() => setRotation(r => (r + 90) % 360)}>
                  ROTATE 90°
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
