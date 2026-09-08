import VersionSwitch from '../VersionSwitch.tsx';
import './v3.css';

export default function AppV3() {
  return <div className="v3-app"><header className="v3-header"><strong>Migracijski atlas</strong><VersionSwitch version="v3" /></header>
    <main><h1>Hrvatska u pokretu.</h1><p>1998–2025 · 21 županija</p></main>
  </div>;
}
