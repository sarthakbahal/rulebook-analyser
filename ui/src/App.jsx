import { useState } from 'react'
import Header from './components/Header.jsx'
import QueryPanel from './components/QueryPanel.jsx'
import DocumentInspector from './components/DocumentInspector.jsx'
import EvalModal from './components/EvalModal.jsx'

export default function App() {
  const [response, setResponse] = useState(null)
  const [evalOpen, setEvalOpen] = useState(false)
  const [activeDoc, setActiveDoc] = useState('academic_handbook.pdf')
  const [highlight, setHighlight] = useState(null) // { source, location, quote }

  const handleCitationClick = (source, location, quote) => {
    setActiveDoc(source)
    setHighlight({ source, location, quote })
  }

  return (
    <div className="h-screen flex flex-col bg-surface-50 text-slate-200 overflow-hidden">
      <Header onOpenEval={() => setEvalOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <QueryPanel
          response={response}
          onResponse={setResponse}
          onCitationClick={handleCitationClick}
        />
        <DocumentInspector
          activeDoc={activeDoc}
          highlight={highlight}
          onTabChange={setActiveDoc}
        />
      </div>

      {evalOpen && <EvalModal onClose={() => setEvalOpen(false)} />}
    </div>
  )
}
