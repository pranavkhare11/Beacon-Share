import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DropZone from '../../components/common/DropZone.jsx'
import TransmissionDeck from '../../components/common/TransmissionDeck.jsx'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const queryParams = new URLSearchParams(window.location.search)
  const isDevMode = queryParams.get('dev') === 'true' || queryParams.get('mock') === 'true'

  const [activeTab, setActiveTab] = useState('send') // 'send' | 'receive'
  const [beaconInput, setBeaconInput] = useState('')
  const [inputError, setInputError] = useState('')

  const [filesList, setFilesList] = useState(() => {
    if (isDevMode) {
      const zipBlob = new Blob(["mock zip file content"], { type: 'application/zip' })
      const zipFile = new File([zipBlob], 'mock_design_assets.zip', { type: 'application/zip' })
      
      const pdfBlob = new Blob(["mock pdf content"], { type: 'application/pdf' })
      const pdfFile = new File([pdfBlob], 'nothing_handbook_v2.pdf', { type: 'application/pdf' })
      
      return [zipFile, pdfFile]
    }
    return []
  })

  const handleJoinBeacon = (e) => {
    e.preventDefault()
    const cleanCode = beaconInput.trim()
    if (!cleanCode) {
      setInputError('PLEASE ENTER A VALID BEACON CODE OR PEER ID')
      return
    }
    setInputError('')
    navigate(`/receive/${encodeURIComponent(cleanCode)}`)
  }

  return (
    <div className="home-page">
      {/* Mode Switcher Bar */}
      <header className="home-mode-bar panel">
        <div className="mode-bar-left">
          <div className="glyph-band">
            <span className="glyph-dot" />
            <span>SYS.MODE // SELECT TRANSMISSION ROLE</span>
          </div>
        </div>
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab-pill ${activeTab === 'send' ? 'active' : ''}`}
            onClick={() => setActiveTab('send')}
          >
            {activeTab === 'send' && <span className="tab-active-dot" />}
            TRANSMIT (SEND)
          </button>
          <button
            type="button"
            className={`mode-tab-pill ${activeTab === 'receive' ? 'active' : ''}`}
            onClick={() => setActiveTab('receive')}
          >
            {activeTab === 'receive' && <span className="tab-active-dot" />}
            RECEIVE VIA CODE
          </button>
        </div>
      </header>

      {/* Beacon Code Input Box (Default page receive feature) */}
      {(activeTab === 'receive' || filesList.length === 0) && (
        <section className="beacon-input-card panel">
          <span className="card-screw top-left" aria-hidden="true" />
          <span className="card-screw top-right" aria-hidden="true" />
          <span className="card-screw bottom-left" aria-hidden="true" />
          <span className="card-screw bottom-right" aria-hidden="true" />

          <div className="beacon-input-header">
            <div className="beacon-header-title">
              <span className="decor-led active" />
              <h3>JOIN TRANSMISSION BEACON</h3>
            </div>
            <span className="beacon-header-tag">P2P.LINK // INPUT</span>
          </div>

          <p className="beacon-input-desc">
            Have a Beacon Code from a sender device? Enter it below to join the session and receive files.
          </p>

          <form onSubmit={handleJoinBeacon} className="beacon-input-form">
            <div className="beacon-input-field-group">
              <input
                type="text"
                className="beacon-code-input"
                placeholder="Enter Beacon Code (e.g. BC-8492 or Peer ID)"
                value={beaconInput}
                onChange={(e) => {
                  setBeaconInput(e.target.value)
                  if (inputError) setInputError('')
                }}
              />
              <button type="submit" className="beacon-connect-btn">
                CONNECT & RECEIVE
              </button>
            </div>
            {inputError && <div className="beacon-input-error">{inputError}</div>}
          </form>
        </section>
      )}

      {/* Transmit/Sender Section */}
      {activeTab === 'send' && (
        <>
          <DropZone filesList={filesList} setFilesList={setFilesList} />
          <TransmissionDeck filesList={filesList} setFilesList={setFilesList} />
        </>
      )}
    </div>
  )
}
