// Guatemala es UTC-6 (Sin horario de verano)
const GUATEMALA_OFFSET_MS = -6 * 60 * 60 * 1000;

export function guatemalaNow(): { date: string; minutes: number } {
    const shifted = new Date(Date.now() + GUATEMALA_OFFSET_MS);
    return {
        date: shifted.toISOString().slice(0, 10), // YYYY-MM-DD
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
}

// "HH:MM" o "HH:MM:SS"
export function hhmmToMinutes(time: string): number {
    const [h, m] = time.split(':');
    return Number(h) * 60 + Number(m);
}

// Suma dias a una fecha ISO sin tocar zona horaria. 
export function addDaysToISODate(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function dayOfWeekFromISODate(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

