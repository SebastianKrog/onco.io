// Machine-readable reporter used by the release runner. Scenario IDs are emitted
// only for test cases which Node has reported as passing.
export default async function* acceptanceReporter(source) {
  for await (const event of source) {
    if (event.type === 'test:pass') {
      const match = /^acceptance \d{2}: .* \[scenario:(\d+)\]$/.exec(event.data?.name ?? '');
      if (match) yield `${JSON.stringify({type:'acceptance-scenario-pass',scenarioId:Number(match[1]),testName:event.data.name})}\n`;
    }
  }
}
