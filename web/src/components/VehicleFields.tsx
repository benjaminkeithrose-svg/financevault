import { VEHICLE_TYPES } from "../utils.js";

export const EMPTY_VEHICLE_FIELDS = {
  vehicleType: "CAR",
  make: "",
  model: "",
  year: "",
  registration: "",
  registrationExpiry: "",
  identifier: "",
};

/** Turns the form's text fields into what the API expects. */
export function vehicleFieldsPayload(form: Record<string, string>) {
  return {
    vehicleType: form.vehicleType || null,
    make: form.make || null,
    model: form.model || null,
    year: form.year ? Number(form.year) : null,
    registration: form.registration || null,
    registrationExpiry: form.registrationExpiry ? new Date(form.registrationExpiry).toISOString() : null,
    identifier: form.identifier || null,
  };
}

/** Details for a car, motorcycle, boat, jet ski, caravan or trailer. */
export function VehicleFields({
  form,
  onChange,
}: {
  form: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const set = (key: string) => (e: { target: { value: string } }) => onChange({ ...form, [key]: e.target.value });
  const isBoat = form.vehicleType === "BOAT" || form.vehicleType === "JET_SKI";
  return (
    <>
      <label>Kind of vehicle</label>
      <select value={form.vehicleType} onChange={set("vehicleType")}>
        {VEHICLE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <div className="grid grid-3">
        <div>
          <label>Year</label>
          <input type="number" inputMode="numeric" value={form.year} onChange={set("year")} placeholder="2021" />
        </div>
        <div>
          <label>Make</label>
          <input value={form.make} onChange={set("make")} placeholder={isBoat ? "Quintrex" : "Toyota"} />
        </div>
        <div>
          <label>Model</label>
          <input value={form.model} onChange={set("model")} placeholder={isBoat ? "490 Top Ender" : "Hilux SR5"} />
        </div>
      </div>
      <div className="grid grid-3">
        <div>
          <label>Registration</label>
          <input value={form.registration} onChange={set("registration")} />
        </div>
        <div>
          <label>Rego expires</label>
          <input type="date" value={form.registrationExpiry} onChange={set("registrationExpiry")} />
        </div>
        <div>
          <label>{isBoat ? "Hull ID (HIN)" : "VIN"}</label>
          <input value={form.identifier} onChange={set("identifier")} />
        </div>
      </div>
    </>
  );
}
