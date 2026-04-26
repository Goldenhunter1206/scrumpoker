import React from 'react';

interface Props {
  issueKey?: string;
  title: string;
  description?: string;
  issueType?: string;
  priority?: string;
  status?: string;
}

export default function CurrentIssueCard({ issueKey, title, description, issueType, priority, status }: Props) {
  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#DFE1E6] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {issueKey && (
            <span className="text-sm font-mono text-[#0052CC] font-semibold">
              {issueKey}
            </span>
          )}
          <span className="text-base font-semibold text-[#172B4D]">{title}</span>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {description && (
          <p className="text-sm text-[#5E6C84] leading-relaxed">{description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {issueType && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-[#DEEBFF] text-[#0052CC]">
              {issueType}
            </span>
          )}
          {priority && (
            <span className={\`px-2 py-1 rounded text-xs font-medium \${
              priority === 'High' ? 'bg-red-100 text-red-700' :
              priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }\`}>
              {priority}
            </span>
          )}
          {status && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-[#F4F5F7] text-[#5E6C84]">
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
