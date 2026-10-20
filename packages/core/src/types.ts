/* MAJOBELLA · Tipos compartidos (lo que devuelve la API y lo que usan las apps) */

export interface Hours { open: string; close: string }
export interface ScheduleConfig {
  timeZone: string;
  utcOffset: string;
  hours: Record<string, Hours | null>;
  slotStepMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  blockedDates: string[];
}

export interface PublicConfig {
  brand: { name: string; slogan: string };
  whatsapp: { number: string; display: string; greeting: string };
  social: { instagram: string; tiktok: string };
  contact: { address: string; email: string; mapsUrl: string; lat: number; lng: number };
  currency: { symbol: string; locale: string };
  schedule: ScheduleConfig;
  policies: { changeHours: number; arriveEarlyMinutes: number };
  payments: { depositPercent: number; usdRate: number; holdMinutes: number };
  webUrl: string;
  apiUrl: string;
}

/* Servicio con sus textos de detalle (de la web) y su precio y duración (del estudio) */
export interface ServiceInfo {
  id: string;
  category: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  priceFrom: boolean;
  depositPercent?: number | null;
  idealFor?: string;
  includes?: string[];
  results?: string;
  prep?: string[];
  aftercare?: string[];
  order?: number;
}
export interface FaqItem { q: string; a: string }

export interface Promo { id: string; name: string; services: string[]; kind: 'monto' | 'porcentaje' | string; value: number; until: string }
export interface PackageInfo {
  id: string; name: string; service: string; serviceName: string; sessions: number; price: number;
  regular?: number; savings?: number; validDays?: number; description?: string; [k: string]: unknown;
}
export interface TransferAccount { id: string; bank: string; type: string; number: string; holder: string; doc: string; note: string }

export interface Catalog {
  ok: boolean;
  services: { id: string; name: string; durationMinutes: number; price: number; priceFrom: boolean; depositPercent: number | null }[];
  payments: { usdRate: number; depositPercent: number; holdMinutes: number; cancelHours: number; paypalEnv?: string };
  schedule: Partial<ScheduleConfig>;
  site: {
    announcement?: { active: boolean; text: string; link: string };
    google?: { rating: number; count: number; url: string; reviewUrl: string };
    majo?: { title: string; text: string; certs: string[]; photo: string };
    business?: { name: string; rnc: string; email: string; address: string; whatsapp: string };
  };
  gallery: { id: string; service: string; before: string; after: string; text: string }[];
  reviews: { id: string; author: string; stars: number; text: string; date: string }[];
  packages: PackageInfo[];
  loyalty: { enabled: boolean; every: number; kind: string; value: number };
  waitlist: { enabled: boolean };
  transfer: { enabled: boolean; minutes?: number; accounts: TransferAccount[]; [k: string]: unknown };
  reschedule: { max: number };
  security: { turnstileSiteKey?: string };
  giftShop: { enabled: boolean; min: number; max: number; validDays: number } | null;
  promos: Promo[];
  cached?: boolean;
}

export type AppointmentStatus = 'retenida' | 'expirada' | 'confirmada' | 'completada' | 'no-asistio' | 'cancelada' | 'por-confirmar' | string;
export interface Appointment {
  id: string;
  remote?: boolean;
  status: AppointmentStatus;
  date: string; time: string; start: string; end: string;
  durationMinutes: number;
  totalPrice: number;
  services: { id: string; name: string; price: number; durationMinutes: number }[];
  payment: {
    subtotalRD: number; discountRD: number; giftRD: number;
    depositRD: number; depositUSD: string | number; depositPaid: boolean; depositMethod: string;
    balanceRD: number; balanceStatus: string; balanceMethod: string;
    refund: string;
    transfer: { deadline: string; proof: boolean; sentAt: string; account: string } | null;
  };
  changes: { used: number; max: number };
  client: { name: string; email: string; phone?: string; notes?: string };
  consent: { needed: boolean; signed: boolean; signedAt: string; url: string };
  bono: { code: string; amountRD: number } | null;
  /* Solo en la app (citas reservadas sin cuenta) */
  token?: string;
}

export interface Pricing {
  subtotalRD: number; discountRD: number; totalRD: number; promoName: string; giftAppliedRD: number;
  depositRD: number; depositUSD: number | string; balanceRD: number;
  codeStatus?: string; giftStatus?: string; giftBalanceRD?: number; giftKind?: string; bonoName?: string; bonoLeft?: number;
  loyaltyApplied?: number; usdRate?: number;
}

export interface ClientData { name: string; firstName?: string; lastName?: string; phone: string; email: string; notes?: string; birthday?: string }

export interface HoldResult {
  ok: true; id: string; manageToken: string;
  orderId?: string; approveUrl?: string; confirmed?: boolean; transfer?: boolean;
  accounts?: TransferAccount[];
  totalRD?: number; depositRD?: number; depositUSD?: string; balanceRD?: number; usdRate?: number; expiresAt?: string;
  appointment?: Appointment; pricing?: Pricing;
}

export type WalletItem =
  | { code: string; type: 'gift'; amountRD: number; balanceRD: number; to: string; from: string; message: string; expires: string; status: string }
  | { code: string; type: 'package'; name: string; service: string; serviceName: string; sessions: number; used: number; expires: string; status: string }
  | { code: string; type: 'unknown'; status: string };

export interface Loyalty { enabled: boolean; every: number; visits: number; eligible: boolean; kind: string; value: number }

export type DayStatus = 'closed' | 'full' | 'open' | 'unknown';
