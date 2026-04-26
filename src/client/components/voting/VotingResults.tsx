interface Vote {
  name: string;
  vote: string | number;
}

interface Props {
  votes: Vote[];
  average: number;
  consensus: number | string;
}

export default function VotingResults({ votes, average, consensus }: Props) {
  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[#172B4D] mb-4">Voting Results</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {votes.map((v) => (
          <div key={v.name} className="text-center p-3 bg-[#F4F5F7] rounded-lg border border-[#DFE1E6]">
            <div className="text-lg font-bold text-[#0052CC]">{v.vote}</div>
            <div className="text-xs text-[#5E6C84] mt-1 truncate">{v.name}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[#DFE1E6] flex items-center gap-6">
        <div>
          <span className="text-xs text-[#5E6C84]">Average: </span>
          <span className="text-sm font-semibold text-[#172B4D]">{average}</span>
        </div>
        <div>
          <span className="text-xs text-[#5E6C84]">Consensus: </span>
          <span className="text-sm font-semibold text-[#172B4D]">{consensus}</span>
        </div>
      </div>
    </div>
  );
}
