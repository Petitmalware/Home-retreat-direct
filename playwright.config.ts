import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'browser.spec.ts',timeout:240000,expect:{timeout:30000},workers:1,use:{baseURL:process.env.APP_ORIGIN??'http://127.0.0.1:3000',headless:true,viewport:{width:1440,height:1000},channel:process.env.PLAYWRIGHT_CHANNEL??'chrome',trace:'retain-on-failure'},outputDir:'test-results'});
