// ISO 3166-1 numeric → country name. Matches the IDs in world-atlas/countries-110m.json
// so we can identify which geography corresponds to which country.
export const ISO_TO_COUNTRY = {
  '504': 'Morocco',
  '566': 'Nigeria',
  '404': 'Kenya',
  '710': 'South Africa',
  '818': 'Egypt',
  '288': 'Ghana',
  '384': "Côte d'Ivoire",
  '686': 'Senegal',
  '231': 'Ethiopia',
  '834': 'Tanzania',
  '528': 'Netherlands',
  '276': 'Germany',
  '826': 'United Kingdom',
  '250': 'France',
  '840': 'United States',
  '156': 'China',
  '356': 'India',
};

// Country centroids — [lng, lat] for react-simple-maps
// Covers all countries that appear in seed consignments and orgs.
export const COUNTRY_COORDS = {
  'Morocco':        [-7.0926, 31.7917],
  'Nigeria':        [8.6753, 9.0820],
  'Kenya':          [37.9062, -0.0236],
  'South Africa':   [22.9375, -30.5595],
  'Egypt':          [30.8025, 26.8206],
  'Ghana':          [-1.0232, 7.9465],
  "Côte d'Ivoire":  [-5.5471, 7.5400],
  'Ivory Coast':    [-5.5471, 7.5400],
  'Senegal':        [-14.4524, 14.4974],
  'Ethiopia':       [40.4897, 9.1450],
  'Tanzania':       [34.8888, -6.3690],
  'Netherlands':    [5.2913, 52.1326],
  'Germany':        [10.4515, 51.1657],
  'United Kingdom': [-3.4360, 55.3781],
  'France':         [2.2137, 46.2276],
  'United States':  [-95.7129, 37.0902],
  'China':          [104.1954, 35.8617],
  'India':          [78.9629, 20.5937],
};

// Approximate radius (degrees) for spreading actor markers inside each country.
// Tuned to roughly match each country's smaller half-dimension (so actors
// stay inside the country in both directions, even for wide/tall shapes).
export const COUNTRY_SPREAD = {
  'Morocco':        5.0,
  'Nigeria':        4.5,
  'Kenya':          4.0,
  'South Africa':   6.5,
  'Egypt':          5.0,
  'Ghana':          2.7,
  "Côte d'Ivoire":  2.8,
  'Ivory Coast':    2.8,
  'Senegal':        2.5,
  'Ethiopia':       7.0,
  'Tanzania':       5.5,
  'Netherlands':    1.5,
  'Germany':        3.2,
  'United Kingdom': 3.0,
  'France':         4.2,
  'United States':  12.0,
  'China':          12.0,
  'India':          8.0,
};

// Parse country from org.role strings like "Exporter · Morocco" or "Customs Authority · Nigeria"
export function countryFromRole(role) {
  if (!role) return null;
  const parts = role.split('·').map(s => s.trim());
  if (parts.length < 2) return null;
  const candidate = parts[1];
  return COUNTRY_COORDS[candidate] ? candidate : null;
}
