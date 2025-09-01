import { BuildOptions, BuildResult } from 'esbuild';

export interface NikCLIBuildConfig extends BuildOptions {
  entryPoints: string[];
  bundle: boolean;
  platform: 'node';
  target: string;
  outfile: string;
  format: 'cjs';
  external: string[];
  alias: Record<string, string>;
  sourcemap: boolean;
  minify: boolean;
  keepNames: boolean;
  treeShaking: boolean;
  metafile: boolean;
  banner: {
    js: string;
  };
  define: Record<string, string>;
  loader: Record<string, string>;
  plugins: any[];
}

export interface NikCLIBuildConfigs {
  buildConfig: NikCLIBuildConfig;
  devConfig: NikCLIBuildConfig & { watch?: boolean };
  prodConfig: NikCLIBuildConfig;
}

export declare function build(): Promise<BuildResult>;

export declare const buildConfig: NikCLIBuildConfig;
export declare const devConfig: NikCLIBuildConfig & { watch?: boolean };
export declare const prodConfig: NikCLIBuildConfig;
