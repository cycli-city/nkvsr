import { Block } from '../Block'

/** Known limitations. */
export function Limitations() {
  return (
    <Block id="limitations" title="Known limitations">
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Wind only, national level: no demand, price, solar, other generation, contracts, storage or
          balancing data.
        </li>
        <li>
          The API documentation does not say whether FUELHH WIND and WINDFOR cover the same scope (for example
          transmission-connected wind only, or embedded wind too). Part of any persistent bias could therefore
          be definitional rather than forecast skill; this analysis cannot tell the two apart.
        </li>
        <li>
          <code className="font-mono text-xs">publishTime</code> is taken as the moment a forecast became
          available to buyers; internal publication latency is unknown.
        </li>
        <li>
          The cutoff is an upper bound; a buyer&apos;s true decision time is earlier, which would lower
          forecast quality.
        </li>
        <li>
          One month of history: statistics are descriptive of that month and may not generalise across
          seasons.
        </li>
        <li>Historical analysis only; this is not a live trading signal and has no price information.</li>
      </ul>
    </Block>
  )
}
