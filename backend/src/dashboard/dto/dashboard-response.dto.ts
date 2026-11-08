export class DashboardResponseDto {
  // Clients the caller may see (an admin: all, pool included).
  clients!: number;
  // Deals in NEW, QUALIFICATION or NEGOTIATION.
  activeDeals!: number;
  wonDeals!: number;
  lostDeals!: number;
  // The caller's own unfinished tasks due today (UTC day).
  tasksToday!: number;
  // Sum of the value of WON deals, rounded to 2 decimals.
  revenue!: number;
}
