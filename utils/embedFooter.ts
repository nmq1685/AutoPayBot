export function getFooter(
  guildName: string,
  guildIconURL: string | null,
  extraText?: string
): { text: string; iconURL?: string } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
  const formattedTime = `Today at ${now.toLocaleString('en-US', options)}`;

  let text = `${guildName} • ${formattedTime}`;
  if (extraText) {
    text = `${extraText} • ${text}`;
  }

  return {
    text,
    iconURL: guildIconURL || undefined,
  };
}