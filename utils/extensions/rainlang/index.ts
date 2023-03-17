export function rainlang(
  strings: TemplateStringsArray,
  ...vars: any[]
): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result = result + strings[i] + (vars[i] ?? "");
  }
  return result;
}
