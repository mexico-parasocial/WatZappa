export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class OpenAIClient {
  constructor(
    public apiKey: string,
    public model: string,
  ) {}

  async chatCompletion(messages: OpenAIMessage[]): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error: ${res.status} ${err}`)
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }
    return json.choices[0]?.message?.content ?? ''
  }
}
