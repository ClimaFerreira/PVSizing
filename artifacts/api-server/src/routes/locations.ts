import { Router, type IRouter } from "express";
import { ListLocationsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Portuguese locations with real coordinates from BeAirPV
const PORTUGUESE_LOCATIONS = [
  { nome: "Faro", latitude: 37.02218424909912, longitude: -7.931350113317662, regiao: "Algarve" },
  { nome: "Lisboa", latitude: 38.72441732326846, longitude: -9.138974197473287, regiao: "Lisboa e Vale do Tejo" },
  { nome: "Setúbal", latitude: 38.533055546239744, longitude: -8.890898192045682, regiao: "Lisboa e Vale do Tejo" },
  { nome: "Évora", latitude: 38.572248427966365, longitude: -7.9134906901216375, regiao: "Alentejo" },
  { nome: "Beja", latitude: 38.01640616157016, longitude: -7.86296831596035, regiao: "Alentejo" },
  { nome: "Porto", latitude: 41.160456084029114, longitude: -8.629535445509084, regiao: "Norte" },
  { nome: "Viseu", latitude: 40.66154075479026, longitude: -7.9119916443788325, regiao: "Centro" },
  { nome: "Coimbra", latitude: 40.20517844691033, longitude: -8.410318290076404, regiao: "Centro" },
  { nome: "Braga", latitude: 41.55032, longitude: -8.42005, regiao: "Norte" },
  { nome: "Aveiro", latitude: 40.64427, longitude: -8.64554, regiao: "Centro" },
  { nome: "Leiria", latitude: 39.74362, longitude: -8.80705, regiao: "Centro" },
  { nome: "Santarém", latitude: 39.23628, longitude: -8.68506, regiao: "Lisboa e Vale do Tejo" },
  { nome: "Portalegre", latitude: 39.29667, longitude: -7.43024, regiao: "Alentejo" },
  { nome: "Bragança", latitude: 41.80621, longitude: -6.75918, regiao: "Norte" },
  { nome: "Vila Real", latitude: 41.29966, longitude: -7.74656, regiao: "Norte" },
  { nome: "Guarda", latitude: 40.53726, longitude: -7.26757, regiao: "Centro" },
  { nome: "Castelo Branco", latitude: 39.82168, longitude: -7.4919, regiao: "Centro" },
  { nome: "Açores (Ponta Delgada)", latitude: 37.73969, longitude: -25.66606, regiao: "Açores" },
  { nome: "Madeira (Funchal)", latitude: 32.71753785291034, longitude: -16.99063567472307, regiao: "Madeira" },
];

router.get("/tools/locations", (_req, res): void => {
  res.json(ListLocationsResponse.parse(PORTUGUESE_LOCATIONS));
});

export default router;
