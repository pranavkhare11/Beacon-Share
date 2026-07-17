/**
 * useDropZoneService
 * 
 * A unified hook that abstracts drag-and-drop file handling behind two
 * swappable providers:
 * 
 *   - 'native'          → Pure HTML5 drag-and-drop via DOM event listeners.
 *                          Works reliably with React 19.
 * 
 *   - 'react-dropzone'  → Uses the react-dropzone library for both
 *                          click-to-browse AND drag-and-drop.
 *                          Currently broken for drag-and-drop in React 19
 *                          due to synthetic event / dataTransfer issues.
 * 
 * Usage:
 *   const dz = useDropZoneService({ provider: 'native', onFiles: fn });
 * 
 * When react-dropzone ships a React 19 fix, switch to:
 *   const dz = useDropZoneService({ provider: 'react-dropzone', onFiles: fn });
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

// ─── Native HTML5 Provider ──────────────────────────────────────────────────
function useNativeProvider({ onFiles }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dropRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const node = dropRef.current;
    if (!node) return;

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(true);
    };

    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === e.target) {
        setIsDragActive(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (e.dataTransfer?.files?.length > 0) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    };

    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragenter', handleDragEnter);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);

    return () => {
      node.removeEventListener('dragover', handleDragOver);
      node.removeEventListener('dragenter', handleDragEnter);
      node.removeEventListener('dragleave', handleDragLeave);
      node.removeEventListener('drop', handleDrop);
    };
  }, [onFiles]);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e) => {
    if (e.target.files?.length > 0) {
      onFiles(Array.from(e.target.files));
      // Reset so the same file can be re-selected
      e.target.value = '';
    }
  }, [onFiles]);

  // Build props that mirror the react-dropzone shape
  const getRootProps = useCallback((extra = {}) => ({
    ...extra,
    ref: dropRef,
    onClick: openFilePicker,
  }), [openFilePicker]);

  const getInputProps = useCallback(() => ({
    ref: inputRef,
    type: 'file',
    multiple: true,
    style: { display: 'none' },
    onChange: handleInputChange,
    tabIndex: -1,
  }), [handleInputChange]);

  return { getRootProps, getInputProps, isDragActive, rootRef: dropRef };
}

// ─── react-dropzone Provider ────────────────────────────────────────────────
function useReactDropzoneProvider({ onFiles }) {
  const { getRootProps: libGetRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      onFiles(acceptedFiles);
    },
  });

  // Extract the ref from getRootProps so consumers can merge it if needed
  const getRootProps = useCallback((extra = {}) => {
    const { ref, ...rest } = libGetRootProps(extra);
    return { ...rest, rootRef: ref };
  }, [libGetRootProps]);

  return {
    getRootProps: (extra = {}) => {
      const { rootRef, ...rest } = getRootProps(extra);
      return { ...rest, ref: rootRef };
    },
    getInputProps,
    isDragActive,
    rootRef: null,
  };
}

// ─── Public Hook ────────────────────────────────────────────────────────────
/**
 * @param {Object} options
 * @param {'native' | 'react-dropzone'} options.provider - Which engine to use.
 * @param {(files: File[]) => void} options.onFiles - Callback when files are accepted.
 */
export default function useDropZoneService({ provider = 'native', onFiles }) {
  const stableOnFiles = useCallback((files) => {
    onFiles(files);
  }, [onFiles]);

  const nativeResult = useNativeProvider({ onFiles: stableOnFiles });
  const reactDropzoneResult = useReactDropzoneProvider({ onFiles: stableOnFiles });

  // Both hooks always run (rules of hooks), but we return only the active one
  return provider === 'native' ? nativeResult : reactDropzoneResult;
}
