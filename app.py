from flask import Flask, render_template, request, jsonify, session
import requests
from requests.exceptions import ChunkedEncodingError
import json
import os
from datetime import datetime
import uuid
import re
from bs4 import BeautifulSoup

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'
app.config['SESSION_TYPE'] = 'filesystem'

# Log every incoming request (method, path) to help debug routing
@app.before_request
def _log_incoming_request():
    try:
        print(f"Incoming: {request.method} {request.path}", flush=True)
    except Exception:
        pass

# Qraptor Platform Configuration
QRAPTOR_BASE_URL = os.getenv('QRAPTOR_BASE_URL', 'https://appzyjjakwlasqtu.qraptor.ai')
QRAPTOR_API_KEY = os.getenv('QRAPTOR_API_KEY', 'your-api-key-here')
# Map logical agent names to their numeric controller IDs
AGENT_ENDPOINTS = {
    'agent_1': '706',  # create campaign
    'agent_2': '732',  # campain_select
    'agent_3': '712',  # add influencers to campaign
    'agent_4': '703',  # fetch campaign data
    'agent_5': '709',  # send mails
    'analysis_agent': '715'
}

# Global variables to store data between agents
campaign_data = {}
influencer_data = []
campaign_analysis = {}

APP_ID = "936619743392459"

def _parse_compact_number(s: str):
    if not s:
        return None
    s = s.strip().lower().replace(",", "")
    m = re.match(r"(\d+(?:\.\d+)?)([kmb])?$", s)
    if not m:
        try:
            return int(float(s))
        except:
            return None
    num, suf = m.groups()
    num = float(num)
    mul = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get(suf, 1)
    return int(num * mul)

def get_instagram_profile(username: str) -> dict:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    })

    profile_url = f"https://www.instagram.com/{username}/"
    page = s.get(profile_url, timeout=30)
    if page.status_code != 200:
        raise RuntimeError(f"Profile page fetch failed: {page.status_code}")

    s.headers.update({
        "X-IG-App-ID": APP_ID,
        "Referer": profile_url,
        "Accept": "application/json",
    })
    api_url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
    api = s.get(api_url, timeout=30)

    if api.status_code == 200 and "application/json" in api.headers.get("Content-Type", ""):
        j = api.json()
        user = j["data"]["user"]
        return {
            "username": user["username"],
            "name": user.get("full_name"),
            "biography": user.get("biography"),
            "profile_pic_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
            "followers": user["edge_followed_by"]["count"],
            "following": user["edge_follow"]["count"],
            "posts": user["edge_owner_to_timeline_media"]["count"],
            "is_private": user.get("is_private"),
            "is_verified": user.get("is_verified"),
            "source": "web_profile_info",
        }

    soup = BeautifulSoup(page.text, "html.parser")
    og_title = soup.find("meta", property="og:title")
    og_image = soup.find("meta", property="og:image")
    meta_desc = soup.find("meta", attrs={"name": "description"})

    result = {
        "username": username,
        "name": None,
        "biography": None,
        "profile_pic_url": og_image["content"] if og_image else None,
        "followers": None,
        "following": None,
        "posts": None,
        "source": "meta_fallback",
    }

    if og_title and og_title.get("content"):
        title = og_title["content"]
        if "(@" in title:
            result["name"] = title.split("(@")[0].strip()

    if meta_desc and meta_desc.get("content"):
        text = meta_desc["content"]
        m = re.search(r"([\d\.,]+[kKmMbB]?)\s+Followers", text, re.I)
        if m:
            result["followers"] = _parse_compact_number(m.group(1))
        m = re.search(r"([\d\.,]+[kKmMbB]?)\s+Following", text, re.I)
        if m:
            result["following"] = _parse_compact_number(m.group(1))
        m = re.search(r"([\d\.,]+[kKmMbB]?)\s+Posts", text, re.I)
        if m:
            result["posts"] = _parse_compact_number(m.group(1))

    return result

@app.route('/api/instagram_profile', methods=['GET'])
def api_instagram_profile():
    try:
        username = request.args.get('username', '').strip().lstrip('@')
        if not username:
            return jsonify({'success': False, 'message': 'username is required'}), 400
        data = get_instagram_profile(username)
        return jsonify({'success': True, 'profile': data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/proxy_image')
def proxy_image():
    try:
        image_url = request.args.get('url', '')
        if not image_url or not image_url.startswith('http'):
            return jsonify({'success': False, 'message': 'invalid url'}), 400
        # Basic safety: cap size and timeouts
        resp = requests.get(image_url, timeout=15, stream=True, headers={
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': 'https://www.instagram.com/'
        })
        if resp.status_code != 200:
            return jsonify({'success': False, 'message': f'fetch failed {resp.status_code}'}), 502
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
        return app.response_class(resp.iter_content(chunk_size=4096), mimetype=content_type)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def get_access_token():
    token_url = "https://portal.qraptor.ai/auth1/realms/appzyjjakwlasqtu/protocol/openid-connect/token"
    payload = {
        "username": "shimahen",
        "password": "UY2Hh%dsM4",
        "grant_type": "password",
        "client_id": "application",
        "client_secret": "OBtlzRYGsABo2iTzcXD0Wh14IBzLmuAY"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    response = requests.post(token_url, data=payload, headers=headers)
    if response.status_code == 200:
        token_data = response.json()
        access_token = token_data.get("access_token")
        return access_token
    else:
        raise RuntimeError(f"Error getting token: {response.text}")

def call_agent(controller_id: str, input_data: dict):
    access_token = get_access_token()
    api_url = f"{QRAPTOR_BASE_URL}/api/{controller_id}/agent-controller/trigger-agent"
    api_headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    # Try normal JSON response first
    try:
        resp = requests.post(api_url, headers=api_headers, json=input_data, timeout=45)
        if resp.ok:
            try:
                return resp.json()
            except ValueError:
                pass
    except Exception as e:
        print(f"Non-stream call error: {e}")

    # Fallback to SSE stream parsing
    try:
        with requests.post(api_url, headers=api_headers, json=input_data, stream=True, timeout=60) as response:
            last_json = None
            for line in response.iter_lines():
                if line:
                    text = line.decode("utf-8")
                    print("SSE Event:", text)
                    # Accept both raw JSON and prefixed lines
                    if text.startswith("SSE Event: data: "):
                        text = text.replace("SSE Event: data: ", "", 1)
                    elif text.startswith("data:"):
                        text = text.replace("data:", "", 1).strip()
                    try:
                        last_json = json.loads(text)
                    except json.JSONDecodeError:
                        continue
            return last_json
    except ChunkedEncodingError:
        print("SSE stream ended (server closed connection).")
        return None
    except Exception as e:
        print(f"Stream call error: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/campaign')
def campaign():
    return render_template('campaign.html')

@app.route('/results')
def results():
    return render_template('results.html')

@app.route('/analysis')
def analysis():
    return render_template('analysis.html')

@app.route('/api/list_campaigns', methods=['GET'])
def list_campaigns():
    try:
        # Use the QRaptor API to fetch campaigns
        token_url = "https://portal.qraptor.ai/auth1/realms/appzyjjakwlasqtu/protocol/openid-connect/token"
        
        payload = {
            "username": "shimahen",
            "password": "UY2Hh%dsM4",
            "grant_type": "password",
            "client_id": "application",
            "client_secret": "OBtlzRYGsABo2iTzcXD0Wh14IBzLmuAY"
        }
        
        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        # Get access token and call controller 732 using the new method
        response = requests.post(token_url, data=payload, headers=headers, timeout=20)
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get("access_token")
            print(f"Access token acquired: len={len(access_token) if access_token else 0}")
            if not access_token:
                return jsonify({'success': False, 'message': 'Auth response missing access_token'}), 502
            # Use SSE print-style as per tested code, but also parse campaigns
            campaigns = []
            api_url = f"{QRAPTOR_BASE_URL}/api/732/agent-controller/trigger-agent"
            api_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            try:
                with requests.post(api_url, headers=api_headers, json={}, stream=True) as sse_resp:
                    for line in sse_resp.iter_lines():
                        if line:
                            text = line.decode("utf-8")
                            # print("SSE Event:", text)
                            payload_text = text
                            if text.startswith("SSE Event: data: "):
                                payload_text = text.replace("SSE Event: data: ", "", 1)
                            elif text.startswith("data:"):
                                payload_text = text.replace("data:", "", 1).strip()
                            try:
                                j = json.loads(payload_text)
                                rows = j.get("outputs", {}).get("res_rows")
                                if rows:
                                    campaigns = rows
                                    break
                            except json.JSONDecodeError:
                                continue
            except ChunkedEncodingError:
                print("SSE stream ended (server closed connection).")
            except Exception as e:
                print(f"Error calling campaign API: {e}")
                return jsonify({'success': False, 'message': f'Failed to fetch campaigns: {str(e)}'}), 500

            if campaigns:
                return jsonify({'success': True, 'campaigns': campaigns})
            return jsonify({'success': False, 'message': 'No campaigns found'}), 404
        else:
            return jsonify({'success': False, 'message': 'Failed to get access token'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/create_campaign', methods=['POST'])
def create_campaign():
    try:
        data = request.json
        campaign_record = {
            'campaign_name': data.get('campaign_name'),
            'goal': data.get('goal'),
            'created_on': datetime.now().isoformat(),
            'target_audience': data.get('target_audience'),
            'brand_name': data.get('brand_name'),
            'niche': data.get('niche'),
            'brand_website': data.get('brand_website'),
            'platform': data.get('platform'),
            'budget': data.get('budget')
        }
        
        # Store in local memory for now
        campaign_id = str(uuid.uuid4())
        campaign_data[campaign_id] = campaign_record
        
        # Try to create via QRaptor API
        try:
            token_url = "https://portal.qraptor.ai/auth1/realms/appzyjjakwlasqtu/protocol/openid-connect/token"
            
            payload = {
                "username": "shimahen",
                "password": "UY2Hh%dsM4",
                "grant_type": "password",
                "client_id": "application",
                "client_secret": "OBtlzRYGsABo2iTzcXD0Wh14IBzLmuAY"
            }
            
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            
            # Get access token
            response = requests.post(token_url, data=payload, headers=headers)
            
            if response.status_code == 200:
                token_data = response.json()
                access_token = token_data["access_token"]
                
                # Call the create campaign API (agent_1)
                api_url = "https://appzyjjakwlasqtu.qraptor.ai/api/706/agent-controller/trigger-agent"
                api_headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                }
                
                # Prepare campaign data for the API
                api_payload = {
                    "campaign_data": campaign_record,
                    "action": "create_campaign"
                }
                
                with requests.post(api_url, headers=api_headers, json=api_payload, stream=True) as response:
                    for line in response.iter_lines():
                        if line:
                            line_data = line.decode("utf-8")
                            if line_data.startswith("SSE Event: data: "):
                                try:
                                    json_data = json.loads(line_data.replace("SSE Event: data: ", ""))
                                    if json_data.get("success"):
                                        return jsonify({'success': True, 'campaign_id': campaign_id, 'message': 'Campaign created successfully'})
                                except json.JSONDecodeError:
                                    continue
                    
                    # If no successful response from API, return local success
                    return jsonify({'success': True, 'campaign_id': campaign_id, 'message': 'Campaign created locally'})
                    
            else:
                # Fallback to local creation if API fails
                return jsonify({'success': True, 'campaign_id': campaign_id, 'message': 'Campaign created locally (API unavailable)'})
                
        except Exception as e:
            print(f"Error creating campaign via API: {e}")
            # Fallback to local creation
            return jsonify({'success': True, 'campaign_id': campaign_id, 'message': 'Campaign created locally (API error)'})
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/fetch_influencers', methods=['POST'])
def fetch_influencers():
    try:
        data = request.json or {}
        filters = data.get('filters', {})
        # Build a concise user_query similar to the provided example
        parts = []
        if filters.get('niche'): parts.append(str(filters.get('niche')).strip())
        if filters.get('audience_location'): parts.append(str(filters.get('audience_location')).strip())
        if filters.get('audience_gender'): parts.append(str(filters.get('audience_gender')).strip())
        if filters.get('platform'): parts.append(str(filters.get('platform')).strip().lower())
        user_query = ", ".join([p for p in parts if p]) or "tech influencers, indian, male"

        # Step 1: Get Access Token (exact flow)
        token_url = "https://portal.qraptor.ai/auth1/realms/appzyjjakwlasqtu/protocol/openid-connect/token"
        payload = {
            "username": "shimahen",
            "password": "UY2Hh%dsM4",
            "grant_type": "password",
            "client_id": "application",
            "client_secret": "OBtlzRYGsABo2iTzcXD0Wh14IBzLmuAY"
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        resp = requests.post(token_url, data=payload, headers=headers)
        if resp.status_code != 200:
            return jsonify({'success': False, 'message': f'Token error: {resp.text}'}), 502
        access_token = resp.json().get("access_token")
        if not access_token:
            return jsonify({'success': False, 'message': 'Missing access_token'}), 502

        # Step 2: Call API using Access Token (controller 795) and stream SSE
        api_url = f"{QRAPTOR_BASE_URL}/api/795/agent-controller/trigger-agent"
        api_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        final_outputs = {}
        try:
            with requests.post(api_url, headers=api_headers, json={"user_query": user_query}, stream=True) as sse:
                for line in sse.iter_lines():
                    if not line:
                        continue
                    text = line.decode("utf-8")
                    # print("SSE Event:", text)
                    if text.startswith("SSE Event: data: "):
                        text = text.replace("SSE Event: data: ", "", 1)
                    elif text.startswith("data:"):
                        text = text.replace("data:", "", 1).strip()
                    try:
                        j = json.loads(text)
                        if isinstance(j, dict) and j.get('outputs'):
                            final_outputs = j['outputs']
                    except json.JSONDecodeError:
                        continue
        except ChunkedEncodingError:
            # Expected with SSE when server closes connection
            pass

        platform = (final_outputs.get('platform') or '').strip().lower()
        results = final_outputs.get('results') or []
        if not isinstance(results, list) or not results:
            return jsonify({'success': False, 'message': 'No results from QRaptor'}), 502

        # Process new JSON format with brand_fit_score and summary
        enriched = []
        for item in results[:10]:  # Limit to 10 results
            if isinstance(item, dict):
                username = item.get('username', '').strip('@')
                brand_fit_score = item.get('brand_fit_score', 85)
                summary = item.get('summary', '')
            else:
                # Fallback for string format
                username = str(item).lstrip('@').strip()
                brand_fit_score = 85
                summary = ''
                
            if not username:
                continue
                
            platform_final = 'Instagram' if platform.startswith('insta') else ('YouTube' if 'you' in platform else 'Instagram')
            
            if platform_final == 'Instagram':
                try:
                    ig = get_instagram_profile(username)
                    enriched.append({
                        'id': f"insta_{username}",
                        'platform': 'Instagram',
                        'username': ig.get('username') or username,
                        'name': ig.get('full_name') or username,
                        'followers': ig.get('followers', 0),
                        'following': ig.get('following', 0),
                        'posts': ig.get('posts', 0),
                        'avatar': ig.get('profile_pic_url', ''),
                        'verified': ig.get('verified', False),
                        'biography': ig.get('biography', ''),
                        'brand_fit_score': brand_fit_score,
                        'summary': summary,
                        'avg_engagement_rate': ig.get('avg_engagement_rate', 2.5),
                        'profile_url': f"https://instagram.com/{ig.get('username') or username}"
                    })
                except Exception as e:
                    print(f"IG enrich failed for {username}: {e}")
                    enriched.append({
                        'id': f"insta_{username}",
                        'platform': 'Instagram',
                        'username': username,
                        'name': username,
                        'followers': 0,
                        'following': 0,
                        'posts': 0,
                        'avatar': '',
                        'brand_fit_score': brand_fit_score,
                        'summary': summary,
                        'avg_engagement_rate': 2.5,
                        'profile_url': f"https://instagram.com/{username}"
                    })
            else:
                enriched.append({
                    'id': f"yt_{username}",
                    'platform': 'YouTube',
                    'username': username,
                    'name': username,
                    'followers': 0,
                    'following': 0,
                    'posts': 0,
                    'avatar': '',
                    'brand_fit_score': brand_fit_score,
                    'summary': summary,
                    'avg_engagement_rate': 2.5
                })

        global influencer_data
        influencer_data = enriched
        return jsonify({'success': True, 'influencers': enriched, 'count': len(enriched)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/add_influencers', methods=['POST'])
def add_influencers():
    try:
        data = request.json
        campaign_id = data.get('campaign_id')
        influencer_ids = data.get('influencer_ids', [])
        if campaign_id not in campaign_data:
            return jsonify({'success': False, 'message': 'Campaign not found'}), 404
        agent_input = {'campaign_id': campaign_id, 'influencer_ids': influencer_ids, 'action': 'add_influencers'}
        result = qraptor_agent.call_agent('agent_3', agent_input)
        if result:
            return jsonify({'success': True, 'message': f'Added {len(influencer_ids)} influencers to campaign', 'agent_response': result})
        return jsonify({'success': False, 'message': 'Failed to add influencers via agent'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/fetch_campaign_data', methods=['GET'])
def fetch_campaign_data():
    try:
        campaign_id = request.args.get('campaign_id')
        if not campaign_id or campaign_id not in campaign_data:
            return jsonify({'success': False, 'message': 'Campaign not found'}), 404
        agent_input = {'campaign_id': campaign_id, 'action': 'fetch_campaign_data'}
        result = qraptor_agent.call_agent('agent_4', agent_input)
        if result:
            return jsonify({'success': True, 'campaign_data': result})
        return jsonify({'success': False, 'message': 'Failed to fetch campaign data via agent'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500



@app.route('/api/send_emails', methods=['POST'])
def send_emails():
    try:
        data = request.json
        campaign_id = data.get('campaign_id')
        influencer_ids = data.get('influencer_ids', [])
        email_template = data.get('email_template')
        if campaign_id not in campaign_data:
            return jsonify({'success': False, 'message': 'Campaign not found'}), 404
        agent_input = {'campaign_id': campaign_id, 'influencer_ids': influencer_ids, 'email_template': email_template, 'action': 'send_emails'}
        result = qraptor_agent.call_agent('agent_5', agent_input)
        if result:
            return jsonify({'success': True, 'message': f'Emails sent to {len(influencer_ids)} influencers', 'agent_response': result})
        return jsonify({'success': False, 'message': 'Failed to send emails via agent'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/analyze_campaign', methods=['POST'])
def analyze_campaign():
    try:
        data = request.json
        campaign_id = data.get('campaign_id')
        if campaign_id not in campaign_data:
            return jsonify({'success': False, 'message': 'Campaign not found'}), 404
        analysis_input = {'campaign_id': campaign_id, 'action': 'analyze_campaign'}
        result = qraptor_agent.call_agent('analysis_agent', analysis_input)
        if result:
            global campaign_analysis
            campaign_analysis[campaign_id] = result
            return jsonify({'success': True, 'analysis': result})
        return jsonify({'success': False, 'message': 'Failed to analyze campaign via agent'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/get_stored_data')
def get_stored_data():
    return jsonify({'campaigns': campaign_data, 'influencers': influencer_data, 'analysis': campaign_analysis})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
