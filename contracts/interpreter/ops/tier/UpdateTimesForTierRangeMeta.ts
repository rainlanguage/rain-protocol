import { OpMeta } from "../types";

export const updateTimesForTierRangeMeta: OpMeta = {
  name: 'UPDATE_TIMES_FOR_TIER_RANGE',
  description: 'Inserts the result of updating the range of tiers of a report taken from stack by a value taken from the stack into the stack',
  outputs: 1,
  inputs: 2,
  operand: [
      {
          name: 'Start Tier',
          description: 'the starting tier to update',
          startBit: 0,
          endBit: 3,
          validRange: [[0, 8]]
      },
      {
          name: 'End Tier',
          description: 'the ending tier to update',
          startBit: 4,
          endBit: 7,
          validRange: [[0, 8]]
      }
  ],
  aliases: [
      'UPDATETIMESFORTIERRANGE',
      'UPDATE_TIER_RANGE',
      'UPDATETIERRANGE',
      'UPDATE_TIERS',
      'UPDATETIERS',
      'UPDATE_REPORT',
      'UPDATEREPORT',
  ],
  parameters: [
      {
          name: 'Update Timestamp',
          spread: false,
          description: 'the timestamp to update tier range to'
      },
      {
          name: 'Report',
          spread: false,
          description: 'the report to update its tier range'
      }
  ]
}
