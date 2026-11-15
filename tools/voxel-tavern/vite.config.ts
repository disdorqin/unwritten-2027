import {defineConfig} from 'vite';
export default defineConfig({server:{host:'0.0.0.0',proxy:{'/ws/':{target:'http://127.0.0.1:4000',ws:true},'/info':{target:'http://127.0.0.1:4000'}}},build:{target:'esnext'}});
