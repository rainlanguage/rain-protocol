import { OpMeta } from "../types";

export const iTierV2ReportTimeForTierMeta: OpMeta = {
  name: 'ITIERV2_REPORT_TIME_FOR_TIER',
  description: 'Inserts the specified tier level report of an account of a tier contract and optionally contexts which are taken from the stack into the stack',
  outputs: 1,
  inputs: {
      startBit: 0,
      endBit: 7
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 7,
          validRange: [[3], [4], [11]],
          computation: 'this - 3'
      }
  ],
  aliases: [
      'ITIERV2REPORTTIMEFORTIER',
      'SINGLE_REPORT',
      'SINGLEREPORT',
      'SINGLE_TIER_REPORT',
      'SINGLETIERREPORT',
  ],
  parameters: [
      {
          name: 'ITierV2 Address',
          spread: false
      },
      {
          name: 'Account',
          spread: false
      },
      {
          name: 'Tier',
          spread: false
      },
      {
          name: 'Context',
          spread: true,
          description: 'The contextual values'
      }
  ]
}
