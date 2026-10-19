// Compare the About page's build line against what was deployed.
// Tagged: "Version <tag>, commit <short>,"
// Untagged: "Untagged build, commit <short>,"

function buildLineMatches(buildLine, expectedTag, expectedCommit) {
  const expected = expectedTag
    ? `Version ${expectedTag}, commit ${expectedCommit},`
    : `Untagged build, commit ${expectedCommit},`;
  return buildLine != null && buildLine.startsWith(expected);
}

module.exports = { buildLineMatches };
