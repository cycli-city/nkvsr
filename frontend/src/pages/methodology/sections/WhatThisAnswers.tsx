import { Block } from '../Block'

/** What this answers. */
export function WhatThisAnswers() {
  return (
    <Block title="What this answers">
      <p>
        A GB energy supplier buying in the day-ahead market must commit before it knows how much wind will
        blow. WindScope shows (1) the national wind forecast that was <em>actually available</em> at the
        day-ahead decision cutoff and (2) how accurate that forecast turned out to be, so the error can be
        allowed for when choosing how much to buy.
      </p>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-950">
        <strong>Scope warning.</strong> Wind forecast error is <strong>not</strong> the utility&apos;s
        procurement volume. Demand, thermal and other generation, hedges and contracted positions, storage and
        balancing arrangements are outside the data used here. The numbers describe uncertainty in the wind
        component only.
      </p>
    </Block>
  )
}
