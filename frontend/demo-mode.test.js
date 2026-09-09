import test from "node:test";
import assert from "node:assert/strict";
import {applicationRoot,cognitoGroups,isDemoUser} from "./auth.js";

test("Cognitoの戻り先は現在のOrigin直下に固定する",()=>{
  assert.equal(applicationRoot({origin:"http://localhost:5500"}),"http://localhost:5500/");
  assert.equal(applicationRoot({origin:"https://d111111abcdef8.cloudfront.net"}),"https://d111111abcdef8.cloudfront.net/");
  assert.equal(applicationRoot({origin:"https://d111111abcdef8.cloudfront.net",search:"?redirect_uri=https://evil.example"}),"https://d111111abcdef8.cloudfront.net/");
});

test("DemoUser判定は配列とJSON文字列に対応する",()=>{
  assert.equal(isDemoUser({profile:{"cognito:groups":["DemoUser"]}}),true);
  assert.equal(isDemoUser({profile:{"cognito:groups":"[\"Users\",\"DemoUser\"]"}}),true);
  assert.deepEqual(cognitoGroups({profile:{"cognito:groups":"[Users, DemoUser]"}}),["Users","DemoUser"]);
  assert.equal(isDemoUser({profile:{"cognito:groups":["Users"]}}),false);
});
