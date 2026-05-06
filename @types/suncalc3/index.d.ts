declare module "suncalc3" {
  interface SunPosition {
    altitude: number;
    azimuth: number;
  }

  interface SunCalc {
    getPosition(date: Date, lat: number, lng: number): SunPosition;
    getTimes(date: Date, lat: number, lng: number): Record<string, Date>;
  }

  const SunCalc: SunCalc;
  export default SunCalc;
}
