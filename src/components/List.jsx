import React from "react";

const List = ({ elements, selected, onSelect, title, className }) => {
  const handleSelect = (event, name) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(name);
  };

  return (
    <div className={className}>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <ul>
        {Object.entries(elements).map(([name, num]) => (
          <li
            key={name}
            className={`py-0.5 px-3 text-sm text-gray-700 rounded-full cursor-pointer ${selected === name ? "bg-orange-300" : "hover:bg-blue-200"}`}
            onClick={(event) => handleSelect(event, name)}
          >
            <strong>{name}</strong> ({num} trees)
          </li>
        ))}
      </ul>
    </div>
  );
};

export default List;
