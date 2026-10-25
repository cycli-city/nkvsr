import { fmtNumber } from '../../lib/format'

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
    >
      <p aria-live="polite">
        Showing{' '}
        <strong className="tabular-nums text-slate-900">
          {fmtNumber(from)}–{fmtNumber(to)}
        </strong>{' '}
        of <strong className="tabular-nums text-slate-900">{fmtNumber(total)}</strong>
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-xs">
          Rows per page
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 250].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            ← Previous
          </button>
          <span className="whitespace-nowrap px-2 tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </nav>
  )
}
