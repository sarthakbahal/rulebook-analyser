import React from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import CitationChip from './CitationChip';
import StateBadge from './StateBadge';

export default function ResponseDisplay({ response, onCitationClick }) {
  const { state, answer, citations, contradiction_detail, contradiction_explanation, confidence_score } = response;

  // Handle answerable state
  if (state === 'answerable') {
    return (
      <div className="rounded-xl border-l-4 border-accent-green bg-surface-200 p-5">
        <StateBadge state={state} />
        <p className="mt-3 text-sm leading-relaxed">{answer}</p>
        {citations && citations.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Citations</p>
            {citations.map((c, i) => (
              <CitationChip key={i} citation={c} onClick={onCitationClick} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Handle near_miss state
  if (state === 'near_miss') {
    return (
      <div className="rounded-xl border-l-4 border-accent-grey bg-surface-200 p-5">
        <StateBadge state={state} />
        <div className="mt-3 bg-accent-amber/10 border border-accent-amber/30 rounded-lg p-4">
          <p className="text-sm text-accent-amber leading-relaxed">{answer}</p>
        </div>
      </div>
    );
  }

      // Handle contradiction state
    if (state === 'contradiction') {
      return (
        <div className="rounded-xl border-l-4 border-accent-red bg-surface-200 p-5">
          <StateBadge state={state} />
          <p className="mt-3 text-sm leading-relaxed">{answer}</p>
          
          {/* Show direct contradiction detail if available */}
          {contradiction_detail && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-accent-red mb-1">Conflict Details</p>
              <div className="border-2 border-accent-red/40 rounded-lg p-3 bg-accent-red/5">
                <p className="text-accent-red font-medium mb-1">Passage A:</p>
                <p className="text-sm text-zinc-400 mb-1 italic">"{contradiction_detail.passage_a}"</p>
                <p className="text-xs text-zinc-300 mb-1">({contradiction_detail.source_a} · {contradiction_detail.location_a})</p>
              </div>
              <div className="border-2 border-accent-red/40 rounded-lg p-3 bg-accent-red/5">
                <p className="text-accent-red font-medium mb-1">Passage B:</p>
                <p className="text-sm text-zinc-400 mb-1 italic">"{contradiction_detail.passage_b}"</p>
                <p className="text-xs text-zinc-300 mb-1">({contradiction_detail.source_b} · {contradiction_detail.location_b})</p>
              </div>
              {contradiction_detail.conflict_explanation && (
                <div className="mt-2 bg-accent-red/10 border border-accent-red/30 rounded-lg p-3">
                  <p className="text-accent-red font-medium mb-1">Why They Conflict:</p>
                  <p className="text-sm">{contradiction_detail.conflict_explanation}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Fallback show general contradiction explanation */}
          {contradiction_explanation && !contradiction_detail && (
            <div className="mt-4 bg-accent-red/10 border border-accent-red/30 rounded-lg p-3">
              <p className="text-accent-red font-medium mb-1">Conflict Explanation:</p>
              <p className="text-sm">{contradiction_explanation}</p>
            </div>
          )}
          
          {/* Highlight the conflicting passages visually */}
          {contradiction_detail && (
            <div className="mt-6 border-t-2 border-accent-red border-surface-400 p-2">
              <p className="text-xs text-accent-red uppercase tracking-wider">IDENTIFIED CONTRADICTION</p>
              <p className="text-sm leading-relaxed">
                {contradiction_detail.passage_a}<br />
                <em>({contradiction_detail.source_a} · {contradiction_detail.location_a})</em><br />
                <br />
                {contradiction_detail.passage_b}<br />
                <em>({contradiction_detail.source_b} · {contradiction_detail.location_b})</em>
              </p>
            </div>
          )}
        </div>
      );
    }

  return null;
}