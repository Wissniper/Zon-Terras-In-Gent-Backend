declare module "suncalc3" {
  interface SunPosition {
    altitude: number;
    azimuth: number;
  }

  interface SunTimeEntry {
    name: string;
    value: Date;
    ts: number;
    pos: number;
    angle: number;
    julian: number;
    valid: boolean;
  }

  type SunTimes = Record<string, SunTimeEntry | undefined>;

  interface SunCalc {
    getPosition(date: Date, lat: number, lng: number): SunPosition;
    getTimes(date: Date, lat: number, lng: number): Record<string, Date>;
    getSunTimes(date: Date, lat: number, lng: number): SunTimes;
  }

  const SunCalc: SunCalc;
  export default SunCalc;
}
