import React, { useState } from 'react';


const formatStateDistribution = (states) => {
  return states
    .replace(/[\[\]']/g, '')
    .split(',')
    .map(state => state.trim().toUpperCase())
    .join(', ');
};

const NewTreeForm = ({ treeList, coordinates, onSubmit, onCancel }) => {
  const treeNameList = Object.keys(treeList).reduce((accumulator, tree_id) => {
    const tree = treeList[tree_id];
    accumulator[tree.common_name] = tree;
    return accumulator;
  }, {});
  const [formState, setFormState] = useState({
    common_name: '',
    latitude: parseFloat(coordinates.lat),
    longitude: parseFloat(coordinates.lng),
    is_native: false,
    tree_id: '',
    family: '',
    latin_name: '',
    state_distribution: '',
    source: '',
  });

  const handleCommonNameChange = (e) => {
    const selectedCommonName = e.target.value;
    const treeData = treeNameList[selectedCommonName] || {};

    setFormState({
      ...formState,
      common_name: selectedCommonName,
      tree_id: treeData.tree_id || '',
      latin_name: treeData.latin_name || '',
      state_distribution: treeData.state_distribution || '',
      family: treeData.family || '',
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormState({
      ...formState,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formState.common_name || !formState.source) {
      alert("Please fill out all required fields.");
      return;
    }
    if (onSubmit) {
      onSubmit(formState);
    }
  };

  const handleCancel = () => {
    setFormState({
      common_name: '',
      latitude: null,
      longitude: null,
      is_native: false,
      tree_id: '',
      family: '',
      latin_name: '',
      state_distribution: '',
      source: '',
    });
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto p-4 bg-white shadow-md rounded-lg">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Common Name</label>
        <select
          name="common_name"
          value={formState.common_name}
          onChange={handleCommonNameChange}
          className="capitalize mt-1 block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        >
          <option value="">Select a tree</option>
          {Object.keys(treeNameList).map((commonName) => (
            <option className="capitalize" key={commonName} value={commonName}>
              {commonName}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Coordinates</label>
        <input
          type="text"
          name="coordinates"
          value={`${formState.latitude}, ${formState.longitude}`}
          readOnly
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Tree ID</label>
        <input
          type="text"
          name="tree_id"
          value={formState.tree_id}
          readOnly
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Family</label>
        <input
          type="text"
          name="family"
          value={formState.family}
          readOnly
          className="capitalize mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Latin Name</label>
        <input
          type="text"
          name="latin_name"
          value={formState.latin_name}
          readOnly
          className="capitalize mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Native State Distribution</label>
        <input
          type="text"
          name="state_distribution"
          value={formatStateDistribution(formState.state_distribution)}
          readOnly
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Is Native</label>
        <input
          type="checkbox"
          name="is_native"
          checked={formState.is_native}
          onChange={handleInputChange}
          className="capitalize mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Source</label>
        <input
          type="text"
          name="source"
          value={formState.source}
          onChange={handleInputChange}
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
      </div>

      <button
        type="submit"
        className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Submit
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="w-full py-2 px-4 mt-5 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        Cancel
      </button>
    </form>
  );
};

export default NewTreeForm;
