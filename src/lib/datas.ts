// Data de hoje no horário de Fortaleza, no formato do campo de data (AAAA-MM-DD).
export function hojeEmFortaleza(agora: Date = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
}
