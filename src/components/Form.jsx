import React, { useState } from "react";

const SearchableDropdown = ({ options, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return (
    <div className="relative">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder="Search..."
        className="capitalize block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {isOpen && (
        <ul className="absolute z-10 bg-white border border-gray-300 w-full mt-1 max-h-48 overflow-y-auto rounded-md shadow-lg">
          {filteredOptions.map((option, index) => (
            <li
              key={index}
              onClick={() => {
                onSelect(option);
                setIsOpen(false);
                setSearchTerm(option);
              }}
              className="capitalize cursor-pointer p-2 hover:bg-indigo-500 hover:text-white"
            >
              {option}
            </li>
          ))}
          {filteredOptions.length === 0 && <li className="p-2 text-gray-500">No options found</li>}
        </ul>
      )}
    </div>
  );
};

const formatStateDistribution = (states) => {
  return states
    .replace(/[[\]']/g, "")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .sort()
    .join(", ");
};

const Form = ({ objects, coordinates, source, onSubmit, onCancel }) => {
  const [formState, setFormState] = useState({
    common_name: "",
    latitude: parseFloat(coordinates.lat),
    longitude: parseFloat(coordinates.lng),
    is_native: false,
    tree_id: "",
    family: "",
    latin_name: "",
    state_distribution: "",
    source: source,
  });

  const objectsByName = Object.keys(objects).reduce((accumulator, tree_id) => {
    const object = objects[tree_id];
    accumulator[object.common_name] = object;
    return accumulator;
  }, {});

  const resetForm = () => {
    setFormState({
      common_name: "",
      latitude: parseFloat(coordinates.lat),
      longitude: parseFloat(coordinates.lng),
      is_native: false,
      tree_id: "",
      family: "",
      latin_name: "",
      state_distribution: "",
      source: source,
    });
  };

  const handleSelect = (selectedName) => {
    const selected = objectsByName[selectedName] || {};

    setFormState({
      ...formState,
      ...selected,
    });
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormState({
      ...formState,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formState.common_name || !formState.source) {
      alert("Please fill out all required fields.");
      return;
    }
    onSubmit(formState);
  };

  const handleCancel = () => {
    resetForm();
    onCancel();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full p-4 bg-white shadow-md md:rounded-lg overflow-y-auto max-h-[100vh]"
    >
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Common Name</label>
        <SearchableDropdown options={Object.keys(objectsByName).sort()} onSelect={handleSelect} />
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
          className="lowercase mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Latin Name</label>
        <input
          type="text"
          name="latin_name"
          value={formState.latin_name}
          readOnly
          className="lowercase mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Native State Distribution</label>
        <textarea
          type="text"
          name="state_distribution"
          value={formatStateDistribution(formState.state_distribution)}
          readOnly
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-100 resize-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Is Native</label>
        <input
          type="checkbox"
          name="is_native"
          checked={formState.is_native}
          onChange={handleInputChange}
          className="capitalize mt-1 h-6 w-6 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
      </div>

      <div>
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
      </div>
    </form>
  );
};

export default Form;
