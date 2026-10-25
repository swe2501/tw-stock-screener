import sys, json, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from serve_hidden_screen_preview import handler_for
class Preview(unittest.TestCase):
 def setUp(self):
  self.calls=[]
  def screen(body):self.calls.append(body);return {'zhenming_hidden_applied':True,'results':[]}
  self.server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(screen));self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
 def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join()
 def test_file_origin_and_memory_receipt(self):
  req=urllib.request.Request(self.base+'/api/screen?stat=hidden-capability',headers={'Origin':'null'})
  with urllib.request.urlopen(req)as response:self.assertEqual(response.headers['Access-Control-Allow-Origin'],'null');self.assertTrue(json.load(response)['zhenming_hidden'])
  req=urllib.request.Request(self.base+'/api/screen',data=json.dumps({'job_id':'abc-123','zhenming_hidden':{'enabled':True}}).encode(),headers={'Origin':'null','Content-Type':'application/json'})
  with urllib.request.urlopen(req)as response:self.assertTrue(json.load(response)['zhenming_hidden_applied'])
  self.assertNotIn('job_id',self.calls[0])
  with urllib.request.urlopen(self.base+'/api/screen?job_id=abc-123')as response:self.assertTrue(json.load(response)['zhenming_hidden_applied'])
 def test_remote_origin_is_rejected(self):
  req=urllib.request.Request(self.base+'/api/screen?stat=hidden-capability',headers={'Origin':'https://unrelated.invalid'})
  with self.assertRaises(urllib.error.HTTPError)as error:urllib.request.urlopen(req)
  self.assertEqual(error.exception.code,403);self.assertFalse(self.calls)
if __name__=='__main__':unittest.main()
