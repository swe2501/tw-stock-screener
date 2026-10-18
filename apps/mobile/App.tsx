import {SafeAreaProvider} from 'react-native-safe-area-context';
import {WorkspaceProvider} from './src/Workspace';
import AppShell from './src/AppShell';

export default function App(){
 return <SafeAreaProvider><WorkspaceProvider><AppShell/></WorkspaceProvider></SafeAreaProvider>;
}
