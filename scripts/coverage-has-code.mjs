// Does a source file hold any code? (midst-web #24) Comments are trivia to the TypeScript scanner, so a file
// whose first token is the end of the file has none.
import ts from 'typescript'

export function hasCode(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text)
  return scanner.scan() !== ts.SyntaxKind.EndOfFileToken
}
