import React, { useState } from 'react'
import DropZone from '../../components/common/DropZone.jsx'
import TransmissionDeck from '../../components/common/TransmissionDeck.jsx'
import './HomePage.css'

export default function HomePage() {
  const queryParams = new URLSearchParams(window.location.search);
  const isDevMode = queryParams.get('dev') === 'true' || queryParams.get('mock') === 'true';

  const [filesList, setFilesList] = useState(() => {
    if (isDevMode) {
      const zipBlob = new Blob(["mock zip file content"], { type: 'application/zip' });
      const zipFile = new File([zipBlob], 'mock_design_assets.zip', { type: 'application/zip' });
      
      const pdfBlob = new Blob(["mock pdf content"], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'nothing_handbook_v2.pdf', { type: 'application/pdf' });
      
      return [zipFile, pdfFile];
    }
    return [];
  });

  return (
    <div className="home-page">
      {filesList.length === 0 && (
        <section className="page-panel">
          <h2 className='page-panel-heading'>Welcome to Beacon Share</h2>
          <p>Drop or select files in the zone below to view their names instantly.</p>
        </section>
      )}
      <DropZone filesList={filesList} setFilesList={setFilesList} />
      <TransmissionDeck filesList={filesList} setFilesList={setFilesList} />
    </div>
  )
}
