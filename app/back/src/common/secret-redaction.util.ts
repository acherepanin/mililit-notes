export function hideSecretValuesInHtml(contentHtml: string): string {
  return contentHtml.replace(/<div\b(?=[^>]*data-copy-field)[^>]*>/g, (tag) => {
    const isSecret = /\sdata-kind=(["'])(password|credential|token)\1/i.test(tag);
    return isSecret ? tag.replace(/\sdata-value=(["'])[^"']*\1/i, ' data-value=""') : tag;
  });
}

export function redactSecretHtml(value: string): string {
  return value.replace(
    /(<[^>]*data-copy-field[^>]*(?:data-secret="true"|data-kind="(?:password|token|credential)")|<[^>]*(?:data-secret="true"|data-kind="(?:password|token|credential)")[^>]*data-copy-field[^>]*)([^>]*data-value=")[^"]*("[^>]*>)/gi,
    '$1$2[secret hidden]$3',
  );
}

export function redactSecretText(value: string): string {
  return value.replace(
    /\b(password|пароль|token|токен|api[-_\s]?key|secret|секрет)\b\s*[:=-]\s*[^\n,;]+/gi,
    (match, label: string) => `${label}: [secret hidden]`,
  );
}
