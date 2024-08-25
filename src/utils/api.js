import Papa from "papaparse";


const readCSV = async (filepath) => {
  const response = await fetch(filepath);
  const csvData = await response.text();
  const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
  return parsedData
}

export const treeToFeature = (tree) => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: [parseFloat(tree.longitude), parseFloat(tree.latitude)],
  },
  properties: {
    location_id: tree.location_id,
    tree_id: tree.tree_id,
    latin_name: tree.latin_name,
    source: tree.source,
    common_name: tree.common_name,
    is_native: tree.is_native,
  },
});

export const fetchTreeLocations = async () => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const trees = await response.json();
    const geojsonData = {
      type: "FeatureCollection",
      features: trees.map(treeToFeature),
    };
    return geojsonData
  } catch (error) {
    console.error("Error fetching trees:", error);
    throw error;
  }
};

export const fetchTreeInfo = async () => {
  const data = await readCSV(`${process.env.PUBLIC_URL}/assets/tree_information.csv`);
  const treeInfo = data.reduce((accumulator, row) => {
      accumulator[row.tree_id] = row;
      return accumulator;
  }, {});
  return treeInfo;
};

export const sendRemoveLocation = async (locationId, removedBy) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees/remove/${locationId}`, {
      method: "PUT",
      headers: {
          "Content-Type": "application/json",
      },
      body: JSON.stringify({ removed_by: removedBy }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`Error removing tree with location_id ${locationId}:`, error);
    throw error;
  }
};

export const sendAddLocation = async ({ tree_id, latin_name, common_name, latitude, longitude, source, is_native }) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/trees`, {
      method: "POST",
      headers: {
          "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tree_id: tree_id,
        latin_name: latin_name,
        common_name: common_name,
        latitude: latitude,
        longitude: longitude,
        source: source,
        is_native: is_native,
        date_added: new Date().toISOString()
      }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error adding new tree:", error);
    throw error;
  }
};
