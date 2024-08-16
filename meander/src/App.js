import Map from './components/Map';

const App = () => {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Map lng={-71.09299151011383} lat={42.38245089323975} zoom={18} />
    </div>
  );
};

export default App;
