export function reportNumbersFromTeamName(teamName: string) {
  const match = teamName.trim().match(/^syretest\s+(\d+)\s+gruppe\s+(\d+)$/i);
  return {
    studyNumber: match?.[1] ?? "",
    group: match?.[2] ?? teamName.match(/^(?:gruppe|group|team)\s*#?\s*(\d+)$/i)?.[1] ?? teamName,
  };
}
