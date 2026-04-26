import React from 'react';
import { Download } from 'lucide-react';

interface HistoryItem {
  id: string;
  issueKey: string;
  title: string;
  estimate: string | number;
  timestamp: string;
  voters: number;
}

export default function EstimationHistory() {
  // Placeholder data
  const history: HistoryItem[] = [
    {
      id: '1',
      issueKey: 'SF-221',
      title: 'Add dark mode toggle to settings',
      estimate: 5,
      timestamp: '2 min ago',
      voters: 7,
    },
    {
      id: '2',
      issueKey: 'SF-220',
      title: 'Optimize image loading for gallery view',
      estimate: 8,
      timestamp: '8 min ago',
      voters: 6,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#DFE1E6] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#172B4D]">Estimation History</h3>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0052CC] bg-[#DEEBFF] rounded-md hover:bg-[#B3D4FF] transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F4F5F7]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Key</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Estimate</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Voters</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DFE1E6]">
            {history.map((item) => (
              <tr key={item.id} className="hover:bg-[#F4F5F7] transition-colors">
                <td className="px-4 py-3 text-[#172B4D]">{item.id}</td>
                <td className="px-4 py-3 font-mono text-[#0052CC] font-medium">{item.issueKey}</td>
                <td className="px-4 py-3 text-[#172B4D] max-w-xs truncate">{item.title}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#E3FCEF] text-[#36B37E]">
                    {item.estimate}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#5E6C84]">{item.voters}</td>
                <td className="px-4 py-3 text-[#5E6C84]">{item.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
